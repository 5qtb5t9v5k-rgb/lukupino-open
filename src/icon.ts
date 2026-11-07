// Lukupinon logo "Pino, tumma" (valittu 10.10.2026): neljä kirjaa, ylin
// sininen ja yksi keltainen kuin korostus. Lähde: lukupino/assets/lukupino-logo.svg.
// apple-touch-icon on PNG, koska iOS ei hyväksy kotivalikkoon SVG:tä; se
// pyöristää kulmat itse, joten kuvassa ei ole läpinäkyvyyttä.

export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect fill="#1a1a1a"/>
<g transform="translate(512 560)">
 <rect x="-300" y="120" width="600" height="104" rx="20" fill="#faf9f6"/>
 <rect x="-270" y="4" width="560" height="104" rx="20" fill="#f2c94c" transform="rotate(-3)"/>
 <rect x="-285" y="-112" width="540" height="104" rx="20" fill="#faf9f6" transform="rotate(2.5)"/>
 <rect x="-250" y="-236" width="500" height="104" rx="20" fill="#0b5fff" transform="rotate(-4)"/>
</g></svg>`;

const PNG_180 = "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";

export function iconPng(): Uint8Array {
	return Uint8Array.from(atob(PNG_180), (c) => c.charCodeAt(0));
}

export const ICON_LINKS =
	'<link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><meta name="apple-mobile-web-app-title" content="Lukupino">';
