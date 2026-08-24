/**
 * QR 코드 디코딩 모듈
 *
 * - 이미지 파일에서 QR 코드를 디코딩한다.
 * - Data URL에서 QR 코드를 디코딩한다.
 *
 * 이 모듈은 순수 TypeScript이며 UI 관련 의존성이 없다.
 * (Canvas API는 브라우저 표준이므로 허용)
 */

import jsQR from 'jsqr';

/**
 * 이미지 파일(File 객체)에서 QR 코드를 디코딩한다.
 *
 * @param file - 이미지 파일 (png, jpg, gif 등)
 * @returns QR 코드에 포함된 문자열 데이터
 * @throws QR 코드를 찾을 수 없는 경우
 */
export async function decodeQRFromFile(file: File): Promise<string> {
  const dataUrl = await fileToDataURL(file);
  return decodeQRFromDataURL(dataUrl);
}

/**
 * Data URL에서 QR 코드를 디코딩한다.
 *
 * @param dataUrl - 이미지 Data URL (data:image/...)
 * @returns QR 코드에 포함된 문자열 데이터
 * @throws QR 코드를 찾을 수 없는 경우
 */
export async function decodeQRFromDataURL(dataUrl: string): Promise<string> {
  const imageData = await dataURLToImageData(dataUrl);
  const result = jsQR(imageData.data, imageData.width, imageData.height);

  if (!result) {
    throw new Error('QR 코드를 찾을 수 없습니다.');
  }

  return result.data;
}

/**
 * File을 Data URL로 변환한다.
 */
function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Data URL을 ImageData로 변환한다 (Canvas 사용).
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
        reject(new Error('Canvas 2D context를 생성할 수 없습니다.'));
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve(imageData);
    };
    img.onerror = () => reject(new Error('이미지를 로드할 수 없습니다.'));
    img.src = dataUrl;
  });
}
