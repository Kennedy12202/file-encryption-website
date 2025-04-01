"use client"
//client side component 
import { create } from "ipfs-http-client";
import CryptoJS from "crypto-js";
import { supabase } from "@/utils/supabase/supabaseClient";

const [secKey, setSecKey] = useState("");
const [cid, setCid] = useState("");


// RPC API server listening on /ip4/127.0.0.1/tcp/5001
// WebUI: http://127.0.0.1:5001/webui
// Gateway server listening on /ip4/127.0.0.1/tcp/8080

const ipfs = create({ host: "localhost", port: 5001, protocol: "http" });
//may add iv for more security (randomness)
async function encrypt(file, secKey) {
    if (secKey.length !== 32) {
        throw new Error("Key must be 32 characters long");
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader(); 

        reader.onload = async function () {
            const fileData = new Uint8Array(reader.result); //converts the raw binary to a Uint8ArrayG
            const encryptedData = CryptoJS.AES.encrypt(fileData, secKey).toString(); //AES encryption
            //const encryptedFilePath = `${path.basename(file)}_enc`; //way pros vs cons of saving file locally vs uploading straight to IPFS
            //fs.writeFileSync(encryptedFilePath, encryptedData); //write encrypted data to a new file
            //fs.unlinkSync(file) delete original file maybe idk

            const { cid } = await ipfs.add(encryptedData); //upload to IPFS
            console.log("CID:", cid.toString()); //get the CID of the uploaded file
            resolve(cid.toString()); //resolve the promise with the CID
        };

        reader.onerror = reject;
        reader.readAsArrayBuffer(file); //read the file as a data URL
    });
}

//user interface for selecting files from their systems 
export default function FileUploader() {
    const handleUpload = async (event) => {
        const file = event.target.files[0];

        if (!file) return;
        if (secKey.length !== 32) {
            alert("Encryption key must be exactly 32 characters long.");
            return;
        }

        try {
            const uploadedCID = await encrypt(file, secKey);
            setCid(uploadedCID);
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

const savetoSupa = async (cid, secKey) => {
  try { 
    const {error} = await supabase.from("files").insert({
        cid,
        encryptioon_key: secKey
    })
    
    if (error) {
        throw new Error("error:", error)} 
    }
    catch(error) {
        console.error("Error uploading to Supabase:", error);
    }
    return data;
}

