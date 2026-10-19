// Kartenmarkierungen werden im Browser gezeichnet (Canvas + Symbolpfade) – keine Bilddateien von Dritten.
import type { Map as MlMap } from 'maplibre-gl';
import { ICONS } from '$lib/icons';
import { KINDS, type Kind } from '$lib/places';

const W = 40;
const H = 50;
const R = 2; // Pixeldichte

function draw(kind: Kind, selected: boolean, theme: 'light' | 'dark'): ImageData {
	const k = KINDS[kind];
	const scale = selected ? 1.25 : 1;
	const w = Math.round(W * scale);
	const h = Math.round(H * scale);
	const c = document.createElement('canvas');
	c.width = w * R;
	c.height = h * R;
	const ctx = c.getContext('2d')!;
	ctx.scale(R * scale, R * scale);
	// Tropfenform mit Spitze unten – die Spitze zeigt auf den Ort
	const pin = new Path2D('M20 47 C20 47 5 31 5 19.5 A15 15 0 1 1 35 19.5 C35 31 20 47 20 47 Z');
	ctx.shadowColor = 'rgba(8, 19, 32, 0.35)';
	ctx.shadowBlur = 4;
	ctx.shadowOffsetY = 1.5;
	ctx.fillStyle = k.color;
	ctx.fill(pin);
	ctx.shadowColor = 'transparent';
	ctx.lineWidth = selected ? 3 : 2.25;
	ctx.strokeStyle = selected ? (theme === 'dark' ? '#ffc53d' : '#0f2238') : theme === 'dark' ? '#0a1626' : '#ffffff';
	ctx.stroke(pin);
	const icon = new Path2D(ICONS[k.icon] ?? ICONS.pin);
	ctx.save();
	ctx.translate(8.5, 8);
	ctx.scale(0.96, 0.96);
	ctx.lineWidth = 2;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.strokeStyle = k.ink;
	ctx.stroke(icon);
	ctx.restore();
	return ctx.getImageData(0, 0, c.width, c.height);
}

export function addMarkerImages(map: MlMap, theme: 'light' | 'dark') {
	for (const kind of Object.keys(KINDS) as Kind[]) {
		for (const sel of [false, true]) {
			const name = `m-${kind}${sel ? '-sel' : ''}`;
			if (map.hasImage(name)) map.removeImage(name);
			map.addImage(name, draw(kind, sel, theme), { pixelRatio: R });
		}
	}
	if (map.hasImage('m-me')) map.removeImage('m-me');
	const c = document.createElement('canvas');
	c.width = c.height = 28 * R;
	const ctx = c.getContext('2d')!;
	ctx.scale(R, R);
	ctx.beginPath();
	ctx.arc(14, 14, 11, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(26, 92, 154, 0.22)';
	ctx.fill();
	ctx.beginPath();
	ctx.arc(14, 14, 6.5, 0, Math.PI * 2);
	ctx.fillStyle = '#1a5c9a';
	ctx.fill();
	ctx.lineWidth = 2.5;
	ctx.strokeStyle = '#ffffff';
	ctx.stroke();
	map.addImage('m-me', ctx.getImageData(0, 0, c.width, c.height), { pixelRatio: R });
	// Chat: Treffpunkt (roter Wimpel-Pin) und geteilte Live-Standorte (gelber Punkt)
	for (const [name, fill, ink] of [['m-treffpunkt', '#d63d31', '#ffffff']] as const) {
		if (map.hasImage(name)) map.removeImage(name);
		const t = document.createElement('canvas');
		t.width = W * R;
		t.height = H * R;
		const x = t.getContext('2d')!;
		x.scale(R, R);
		const pin = new Path2D('M20 47 C20 47 5 31 5 19.5 A15 15 0 1 1 35 19.5 C35 31 20 47 20 47 Z');
		x.fillStyle = fill;
		x.fill(pin);
		x.lineWidth = 2.25;
		x.strokeStyle = theme === 'dark' ? '#0a1626' : '#ffffff';
		x.stroke(pin);
		x.fillStyle = ink;
		x.fill(new Path2D('M14 10 L14 30 L16 30 L16 22 L27 18 L16 13 Z'));
		map.addImage(name, x.getImageData(0, 0, t.width, t.height), { pixelRatio: R });
	}
	if (map.hasImage('m-person')) map.removeImage('m-person');
	const pc = document.createElement('canvas');
	pc.width = pc.height = 28 * R;
	const px = pc.getContext('2d')!;
	px.scale(R, R);
	px.beginPath();
	px.arc(14, 14, 12, 0, Math.PI * 2);
	px.fillStyle = 'rgba(255, 197, 61, 0.35)';
	px.fill();
	px.beginPath();
	px.arc(14, 14, 7, 0, Math.PI * 2);
	px.fillStyle = '#ffc53d';
	px.fill();
	px.lineWidth = 2.5;
	px.strokeStyle = '#0f2238';
	px.stroke();
	map.addImage('m-person', px.getImageData(0, 0, pc.width, pc.height), { pixelRatio: R });
}
