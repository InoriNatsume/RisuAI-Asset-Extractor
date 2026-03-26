/**
 * Binary Reader/Writer
 * 바이너리 데이터 읽기/쓰기 유틸리티
 * 
 * 참조: RisuAI_Format_Specification.md
 */

/**
 * 바이너리 데이터 읽기 클래스
 */
export class BinaryReader {
  private view: DataView;
  private offset: number = 0;
  private littleEndian: boolean;

  constructor(data: Uint8Array | ArrayBuffer, littleEndian: boolean = true) {
    const buffer = data instanceof Uint8Array ? data.buffer : data;
    const byteOffset = data instanceof Uint8Array ? data.byteOffset : 0;
    const byteLength = data instanceof Uint8Array ? data.byteLength : data.byteLength;
    this.view = new DataView(buffer, byteOffset, byteLength);
    this.littleEndian = littleEndian;
  }

  get position(): number {
    return this.offset;
  }

  get length(): number {
    return this.view.byteLength;
  }

  get remaining(): number {
    return this.length - this.offset;
  }

  seek(position: number): void {
    if (position < 0 || position > this.length) {
      throw new Error(`Seek position ${position} out of bounds [0, ${this.length}]`);
    }
    this.offset = position;
  }

  skip(bytes: number): void {
    this.seek(this.offset + bytes);
  }

  readUint8(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readUint16(): number {
    const value = this.view.getUint16(this.offset, this.littleEndian);
    this.offset += 2;
    return value;
  }

  readUint32(): number {
    const value = this.view.getUint32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }

  readInt8(): number {
    const value = this.view.getInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readInt16(): number {
    const value = this.view.getInt16(this.offset, this.littleEndian);
    this.offset += 2;
    return value;
  }

  readInt32(): number {
    const value = this.view.getInt32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }

  readFloat32(): number {
    const value = this.view.getFloat32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }

  readFloat64(): number {
    const value = this.view.getFloat64(this.offset, this.littleEndian);
    this.offset += 8;
    return value;
  }

  readBytes(length: number): Uint8Array {
    if (this.offset + length > this.length) {
      throw new Error(`Cannot read ${length} bytes from position ${this.offset}, only ${this.remaining} bytes remaining`);
    }
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    return bytes;
  }

  readString(length: number, encoding: 'utf-8' | 'ascii' = 'utf-8'): string {
    const bytes = this.readBytes(length);
    if (encoding === 'ascii') {
      return String.fromCharCode(...bytes);
    }
    return new TextDecoder(encoding).decode(bytes);
  }

  /**
   * null-terminated string 읽기
   */
  readCString(maxLength?: number): string {
    const start = this.offset;
    const max = maxLength ? Math.min(start + maxLength, this.length) : this.length;
    
    while (this.offset < max && this.view.getUint8(this.offset) !== 0) {
      this.offset++;
    }
    
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + start, this.offset - start);
    
    // null terminator 건너뛰기
    if (this.offset < this.length && this.view.getUint8(this.offset) === 0) {
      this.offset++;
    }
    
    return new TextDecoder('utf-8').decode(bytes);
  }

  /**
   * 매직 넘버 검증
   */
  checkMagic(expected: Uint8Array | number[]): boolean {
    const magic = this.readBytes(expected.length);
    const expectedArray = expected instanceof Uint8Array ? expected : new Uint8Array(expected);
    
    for (let i = 0; i < expectedArray.length; i++) {
      if (magic[i] !== expectedArray[i]) {
        return false;
      }
    }
    return true;
  }
}

/**
 * 바이너리 데이터 쓰기 클래스
 */
export class BinaryWriter {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset: number = 0;
  private littleEndian: boolean;

  constructor(initialSize: number = 1024, littleEndian: boolean = true) {
    this.buffer = new ArrayBuffer(initialSize);
    this.view = new DataView(this.buffer);
    this.littleEndian = littleEndian;
  }

  get position(): number {
    return this.offset;
  }

  private ensureCapacity(additionalBytes: number): void {
    const required = this.offset + additionalBytes;
    if (required <= this.buffer.byteLength) return;

    // 2배 또는 필요한 크기 중 더 큰 것으로 확장
    const newSize = Math.max(this.buffer.byteLength * 2, required);
    const newBuffer = new ArrayBuffer(newSize);
    new Uint8Array(newBuffer).set(new Uint8Array(this.buffer));
    this.buffer = newBuffer;
    this.view = new DataView(this.buffer);
  }

  writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }

  writeUint16(value: number): void {
    this.ensureCapacity(2);
    this.view.setUint16(this.offset, value, this.littleEndian);
    this.offset += 2;
  }

  writeUint32(value: number): void {
    this.ensureCapacity(4);
    this.view.setUint32(this.offset, value, this.littleEndian);
    this.offset += 4;
  }

  writeInt8(value: number): void {
    this.ensureCapacity(1);
    this.view.setInt8(this.offset, value);
    this.offset += 1;
  }

  writeInt16(value: number): void {
    this.ensureCapacity(2);
    this.view.setInt16(this.offset, value, this.littleEndian);
    this.offset += 2;
  }

  writeInt32(value: number): void {
    this.ensureCapacity(4);
    this.view.setInt32(this.offset, value, this.littleEndian);
    this.offset += 4;
  }

  writeFloat32(value: number): void {
    this.ensureCapacity(4);
    this.view.setFloat32(this.offset, value, this.littleEndian);
    this.offset += 4;
  }

  writeFloat64(value: number): void {
    this.ensureCapacity(8);
    this.view.setFloat64(this.offset, value, this.littleEndian);
    this.offset += 8;
  }

  writeBytes(bytes: Uint8Array): void {
    this.ensureCapacity(bytes.length);
    new Uint8Array(this.buffer, this.offset, bytes.length).set(bytes);
    this.offset += bytes.length;
  }

  writeString(str: string, encoding: 'utf-8' | 'ascii' = 'utf-8'): void {
    const bytes = encoding === 'ascii'
      ? new Uint8Array([...str].map(c => c.charCodeAt(0)))
      : new TextEncoder().encode(str);
    this.writeBytes(bytes);
  }

  /**
   * null-terminated string 쓰기
   */
  writeCString(str: string): void {
    this.writeString(str, 'utf-8');
    this.writeUint8(0);
  }

  /**
   * 결과 바이트 배열 반환
   */
  toBytes(): Uint8Array {
    return new Uint8Array(this.buffer, 0, this.offset);
  }
}
