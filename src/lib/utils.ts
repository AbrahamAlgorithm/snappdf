import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function imageToCanvas(src: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject("Could not get context");
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = src;
  });
}

export async function rotateImage(canvas: HTMLCanvasElement, degrees: number): Promise<string> {
  const newCanvas = document.createElement("canvas");
  const ctx = newCanvas.getContext("2d");
  if (!ctx) throw new Error("Could not get context");

  const angle = (degrees * Math.PI) / 180;
  const is90Step = degrees % 180 !== 0;

  newCanvas.width = is90Step ? canvas.height : canvas.width;
  newCanvas.height = is90Step ? canvas.width : canvas.height;

  ctx.translate(newCanvas.width / 2, newCanvas.height / 2);
  ctx.rotate(angle);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return newCanvas.toDataURL("image/jpeg", 0.95);
}
