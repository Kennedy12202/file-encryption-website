import CryptoJS from "crypto-js";
import fs from "fs";
import path from "path";

const ipfs = create({ host: "localhost", port: 5001, protocol: "http" });

async function getAnddecryptFile(cid, secKey) {
   if (secKey.length !== 32 ) {
        throw new Error("Key must be 32 characters long");
   }
   const getCID = ipfs.cat(cid); //get info from IPFS
   let encryptedData = "";
   for await (const chunk of getCID) {
       encryptedData += chunk.toString(); //convert to string
   }

   const bytes = CryptoJS.AES.decrypt(encryptedData, secKey) //AES decryption
   const decryptedData = bytes.toString(CryptoJS.enc.Utf8) //convert to string
  
  


   const decryptedFilePath = path.join(path.dirname(cid), `${path.basename(cid)}_decrypted`); //path to save the decrypted file
   fs.writeFileSync(decryptedFilePath, decryptedData); //write decrypted data to a new file
    // fs.unlinkSync(file) delete original file maybe idk
   return decryptedFilePath;
}

export default getAnddecryptFile;