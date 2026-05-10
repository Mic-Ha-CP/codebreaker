const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1 to avoid confusion
const CODE_LENGTH = 4;

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}
