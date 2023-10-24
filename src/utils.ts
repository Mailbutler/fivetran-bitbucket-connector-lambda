import MD5 from "crypto-js/md5";

export function uuidFromMD5(md5Hash: string) {
  return `${md5Hash.substring(0, 8)}-${md5Hash.substring(
    8,
    12
  )}-${md5Hash.substring(12, 16)}-${md5Hash.substring(
    16,
    20
  )}-${md5Hash.substring(20)}`.toLowerCase();
}

export function uuid(someString: string): string {
  return uuidFromMD5(MD5(someString).toString());
}

export function compactArray<T>(array: (T | undefined | null)[]): T[] {
  return array.filter((value) => !!value) as T[];
}
