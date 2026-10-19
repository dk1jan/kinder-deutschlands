# Regelmodul für den Chat-Server von Kinder Deutschlands.
# Wird von scripts/synapse-prepare.mjs in das Konfigurationsverzeichnis kopiert und von Synapse geladen.
# Fragt die App (internes Netz) nach den Plattformregeln:
#   invite – Einladungen nur an eigene Kontakte (nicht blockiert, Konto aktiv)
#   join   – Beitritt ohne Einladung nur mit gültigem Treffen-Ticket (QR)
#   send   – Nachrichten: nicht bei Blockierung (Direktchat), nicht bei Einschränkung, nicht nach Ablauf eines Treffens
# Bei Störungen gilt: lieber ablehnen (fail closed). Ergebnisse für „send“ werden 20 Sekunden zwischengespeichert.
import base64
import hashlib
import hmac
import json
import logging
import time

from synapse.api.errors import Codes
from synapse.module_api import NOT_SPAM, ModuleApi

logger = logging.getLogger(__name__)

MESSAGE_TYPES = {
    "m.room.message",
    "m.room.encrypted",
    "m.sticker",
    "m.reaction",
    "de.kinder.live",
}


class KdRules:
    def __init__(self, config: dict, api: ModuleApi):
        self.api = api
        self.url = config["url"]
        self.secret = config["secret"]
        self.system_user = config.get("system_user", "")
        self.reauth_secret = config.get("reauth_secret", "").encode()
        self.cache: dict = {}
        api.register_spam_checker_callbacks(
            user_may_invite=self.user_may_invite,
            user_may_join_room=self.user_may_join_room,
            check_event_for_spam=self.check_event_for_spam,
            user_may_send_3pid_invite=self.user_may_send_3pid_invite,
            user_may_create_room_alias=self.deny_alias,
            user_may_publish_room=self.deny_publish,
        )
        # Bestätigung für Schlüssel-Zurücksetzen/Geräte (UIA) ohne Passwort: kurzlebiges, von der App signiertes Token.
        if self.reauth_secret:
            api.register_password_auth_provider_callbacks(
                auth_checkers={("de.kinder.reauth", ("token",)): self.check_reauth}
            )

    @staticmethod
    def parse_config(config: dict) -> dict:
        if "url" not in config or "secret" not in config:
            raise Exception("kd_rules: url und secret fehlen")
        return config

    async def ask(self, payload: dict) -> bool:
        try:
            res = await self.api.http_client.post_json_get_json(
                self.url, payload, headers={"Authorization": ["Bearer " + self.secret]}
            )
            return bool(res.get("allow"))
        except Exception as e:  # noqa: BLE001 – jede Störung führt zur Ablehnung
            logger.warning("kd_rules: Prüfung fehlgeschlagen (%s): %s", payload.get("action"), e)
            return False

    async def check_reauth(self, username: str, login_type: str, login_dict: dict):
        try:
            payload_b64, sig = str(login_dict.get("token", "")).split(".", 1)
            expected = base64.urlsafe_b64encode(
                hmac.new(self.reauth_secret, payload_b64.encode(), hashlib.sha256).digest()
            ).rstrip(b"=").decode()
            if not hmac.compare_digest(expected, sig):
                return None
            payload = json.loads(base64.urlsafe_b64decode(payload_b64 + "=" * (-len(payload_b64) % 4)))
            if payload.get("exp", 0) < time.time() or payload.get("purpose") != "reauth":
                return None
            user_id = self.api.get_qualified_user_id(username)
            if payload.get("sub") != user_id:
                return None
            return user_id, None
        except Exception:  # noqa: BLE001
            return None

    async def user_may_invite(self, inviter: str, invitee: str, room_id: str):
        if inviter == self.system_user:
            return NOT_SPAM
        ok = await self.ask({"action": "invite", "inviter": inviter, "invitee": invitee, "room": room_id})
        return NOT_SPAM if ok else Codes.FORBIDDEN

    async def user_may_join_room(self, user: str, room: str, is_invited: bool):
        if user == self.system_user:
            return NOT_SPAM
        ok = await self.ask({"action": "join", "user": user, "room": room, "invited": is_invited})
        return NOT_SPAM if ok else Codes.FORBIDDEN

    async def check_event_for_spam(self, event):
        if event.type not in MESSAGE_TYPES or event.is_state():
            return NOT_SPAM
        if event.sender == self.system_user:
            return NOT_SPAM
        key = (event.sender, event.room_id)
        now = time.monotonic()
        hit = self.cache.get(key)
        if hit and now - hit[1] < 20:
            ok = hit[0]
        else:
            ok = await self.ask({"action": "send", "user": event.sender, "room": event.room_id})
            if len(self.cache) > 5000:
                self.cache.clear()
            self.cache[key] = (ok, now)
        return NOT_SPAM if ok else Codes.FORBIDDEN

    async def user_may_send_3pid_invite(self, inviter: str, medium: str, address: str, room_id: str):
        return Codes.FORBIDDEN

    async def deny_alias(self, user_id: str, room_alias):
        return NOT_SPAM if user_id == self.system_user else Codes.FORBIDDEN

    async def deny_publish(self, user_id: str, room_id: str):
        return Codes.FORBIDDEN
