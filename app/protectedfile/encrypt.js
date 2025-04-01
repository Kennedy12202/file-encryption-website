"use client"
//client side component 
import { create } from "ipfs-http-client";
import CryptoJS from "crypto-js";
import { supabase } from "@/utils/supabase/supabaseClient";


// RPC API server listening on /ip4/127.0.0.1/tcp/5001
// WebUI: http://127.0.0.1:5001/webui
// Gateway server listening on /ip4/127.0.0.1/tcp/8080

const ipfs = create({ host: "localhost", port: 5001, protocol: "http" });
//may add iv for more security (randomness)
async function encrypt(file, secKey) {  //FIRST
    if (secKey.length !== 32) { //2^256 possible AES keys OR 2^32 x 8 
        throw new Error("Key must be 32 characters long");
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();  
        reader.onerror = ()  => reject(new Error ("Failed to read the file"));

        reader.onload = async function () { 
            const fileData = new Uint8Array(reader.result); //CryptoJS does not support raw binary data.
            const wordArray = CryptoJS.lib.WordArray.create(fileData); //expects a word array.
            const iv = CryptoJS.lib.WordArray.random(16); //extra randomness i.e. samev file diff encryption
            const encryptedData = CryptoJS.AES.encrypt(wordArray, secKey, {iv}).toString(); //AES encryption
    

            const { cid } = await ipfs.add(encryptedData); //upload to IPFS
            console.log("CID:", cid.toString()); //get the CID of the uploaded file
            resolve({
                cid: cid.toString(),      //get me all the neccessary components of a file. (metadata)
                iv: iv.toString(),
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type
            })
            
        }; 
        reader.readAsArrayBuffer(file);
    });
}

//user interface for selecting files from their systems 
export default function FileUploader() {
    const [secKey, setSecKey] = useState("");
    const [cid, setCid] = useState("");

    const handleUpload = async (event) => {
        try {
        const file = event.target.files[0];
        if (!file || secKey.length !== 32) {
            alert("Encryption key must be exactly 32 characters long.");
            return;
        }
            const uploadedData = await encrypt(file, secKey);
            await savetoSupa(uploadedData.cid, secKey, uploadedData.fileSize, uploadedData.fileName,uploadedData.fileType,uploadedData.iv);
            setCid(uploadedData.cid);
        } catch (error) {
            console.error("Upload failed:", error);
        }
    }

    return (
        <div>
            <input 
                type="text" 
                value={secKey} 
                onChange={(e) => setSecKey(e.target.value)}
                placeholder="Enter 32-character key"
                maxLength={32}
            />
            <input type="file" onChange={handleUpload} />
            {cid && <p>File uploaded! CID: {cid}</p>}
        </div>
    );
}

const savetoSupa = async (cid, secKey, iv, file_name, file_size, file_type) => {
  try { 
    const {data, error} = await supabase.from("files").insert({
        cid,
        encryption_key: secKey,
        iv,
        file_name,
        file_size,
        file_type,
    });
    
    if (error) {
        throw new Error("error:", error)} 
        return data;

    } catch(error) {
        console.error("Error uploading to Supabase:", error);
        throw error; //if there is an error the function will still return something
    }
}

