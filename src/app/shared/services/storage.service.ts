import { Injectable } from '@angular/core';
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Preferences } from '@capacitor/preferences';

@Injectable({
  providedIn: 'root'
})
export class StorageService {

  constructor() {
  }

  // --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Key Values
  // --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  // set key value
  async set(key: string, value: string) {
    return Preferences.set({ key: key, value: value });
  }

  // get key value
  async get(key: string) {
    const { value } = await Preferences.get({ key: key });
    return value;
  }

  // remove key
  async remove(key: string) {
    return Preferences.remove({ key: key });
  }

  // --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Files
  // --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async writeFile(path: string, data: string) {
    await Filesystem.writeFile({
      path: path,
      data: data,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
  } 

  async readFile(path: string) {
    const contents = await Filesystem.readFile({
      path: path,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
  
    console.log("secrets:", contents);
  }

  async deleteFile(path: string) {
    await Filesystem.deleteFile({
      path: path,
      directory: Directory.Documents,
    });
  }


}

