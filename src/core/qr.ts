/**
 * QR code module
 *
 * - Decode a QR code from an image file.
 * - Decode a QR code from a Data URL.
 * - Encode text into a QR code Data URL.
 *
 * This module is pure TypeScript and has no UI dependencies.
 * (The Canvas API is a browser standard, so it is allowed.)
 */

import jsQR from 'jsqr';
import QRCode from 'qrcode';

/**
 * Encode the given text into a QR code Data URL (PNG).
 *
 * @param text - the string to encode (e.g. an otpauth:// URI)
 * @param size - the QR image size (px, default 240)
 * @returns a Data URL in the form data:image/png;base64,...
 */
export async function encodeQRToDataURL(
  text: string,
  size = 240,
): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}

/**
 * Decode a QR code from an image file (File object).
 *
 * @param file - the image file (png, jpg, gif, etc.)
 * @returns the string data contained in the QR code
 * @throws if no QR code can be found
 */
export async function decodeQRFromFile(file: File): Promise<string> {
  const dataUrl = await fileToDataURL(file);
  return decodeQRFromDataURL(dataUrl);
}

/**
 * Decode a QR code from a Data URL.
 *
 * @param dataUrl - the image Data URL (data:image/...)
 * @returns the string data contained in the QR code
 * @throws if no QR code can be found
 */
export async function decodeQRFromDataURL(dataUrl: string): Promise<string> {
  const imageData = await dataURLToImageData(dataUrl);
  const result = jsQR(imageData.data, imageData.width, imageData.height);

  if (!result) {
    throw new Error('No QR code could be found.');
  }

  return result.data;
}

/**
 * Convert a File to a Data URL.
 */
function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Convert a Data URL to ImageData (using Canvas).
 */
function dataURLToImageData(dataUrl: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not create a Canvas 2D context.'));
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve(imageData);
    };
    img.onerror = () => reject(new Error('The image could not be loaded.'));
    img.src = dataUrl;
  });
}
