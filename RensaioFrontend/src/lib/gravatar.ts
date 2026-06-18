/**
 * Fetches a Gravatar image as a base64 data URL using an HTML Image element + canvas.
 * Avoids fetch/CORS issues by using Image + canvas.toDataURL().
 * Email is NEVER sent to the backend.
 */
export async function fetchGravatarBase64(email: string): Promise<{ base64: string; contentType: string }> {
  const { md5Hash } = await import('./md5');
  const hash = md5Hash(email.trim().toLowerCase());
  const url = `https://www.gravatar.com/avatar/${hash}?s=128&d=mp&r=g`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Failed to get canvas context')); return; }
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];
        resolve({ base64: base64!, contentType: 'image/png' });
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Canvas conversion failed'));
      }
    };
    img.onerror = () => reject(new Error('Failed to load Gravatar image'));
    img.src = url;
  });
}