"use client";

//(client side component) vs. server side component

import { useState } from "react";
import encryptAndUpload from "../utils/encryptAndUpload";

function generateKey() {
    return [...Array(32)].map(() => Math.random().toString(36)[2]).join(""); //generate a random 32-character key
}

export default function FileUploader() {
    const [cid, setCid] = useState(null);
    const [secKey, setSecKey] = useState(generateKey());

    async function handleUpload(event) {
        const file = event.target.files[0];

        if (!file) return;
        if (secKey.length !== 32) {
            alert("Encryption key must be exactly 32 characters long.");
            return;
        }

        try {
            const uploadedCID = await encryptAndUpload(file, secKey);
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
