import CryptoJS from "crypto-js";
import { supabase } from "@/utils/supabase/supabaseClient";
import { create } from "ipfs-http-client";

const ipfs = create({ host: "localhost", port: 5001, protocol: "http" });

async function decrypt(cid) {
 
try{
    
    const {data, error} = await supabase.from("files").select("encryption_key, iv").eq("cid", cid);
    if (error) throw new Error("Failed to fetch from Supabase.");

   const {encryption_key: secKey, iv} = data[0];

   if (secKey.length !== 64 ) {
        throw new Error("AES Key must be 64 characters long.");
   }


   const parsedKey = CryptoJS.enc.Hex.parse(secKey)
   const parsedIV = CryptoJS.unc.Hex.parse(iv); //iv parameter must be a WordArry object 

   let encryptedData = "";  //retrieve the data from IPFS
   for await (const chunk of ipfs.cat(cid)) {
       encryptedData += chunk.toString(); //convert to string
   }

   const decodedEncryptedData = CryptoJS.enc.Base64.parse(encryptedData)
   const decrypted = CryptoJS.AES.decrypt(decodedEncryptedData, parsedKey, parsedIV); //AES decryption

   const originalFile = decrypted.toString(CryptoJS.enc.Utf8) //convert to string

   if(!originalFile) {
    throw new Error("Decryption failed. May be an invalid key.");
   }
   return originalFile; 

} catch (error) {
    console.error("Failed to decrypt file", error);
    throw error; //if there is an error the function will still return something 
    }
}

