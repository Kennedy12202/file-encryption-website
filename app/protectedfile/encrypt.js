"use client"
//client side component 
import { create } from "ipfs-http-client";
import CryptoJS from "crypto-js";
import { supabase } from "@/utils/supabase/supabaseClient";
import { useState } from "react";
import 'buffer';
const ipfs = create({ host: "localhost", port: 5001, protocol: "http", headers: { "Access-Control-Allow-Origin": "*" } });

const generateAESKey = () => {
    return CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);
};

async function encrypt(file, secKey) {
    if (secKey.length !== 64) {
        throw new Error("Key must be 64 characters long");
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read the file"));

        reader.onload = async function () {
            try {
                const fileData = new Uint8Array(reader.result);
                const wordArray = CryptoJS.lib.WordArray.create(fileData);
                const iv = CryptoJS.lib.WordArray.random(16);

                // Use a chunked approach for larger files
                const encryptedData = CryptoJS.AES.encrypt(wordArray, secKey, {
                    iv,
                    mode: CryptoJS.mode.CBC,
                    padding: CryptoJS.pad.Pkcs7
                }).toString();

                const { cid } = await ipfs.add(encryptedData);

                resolve({
                    cid: cid.toString(),
                    iv: iv.toString(),
                    fileName: file.name,
                    fileSize: file.size,
                    fileType: file.type
                });
            } catch (error) {
                reject(new Error(`Encryption failed: ${error.message}`));
            }
        };

        reader.readAsArrayBuffer(file);
    });
}

//user interface for selecting files from their systems 
export default function FileUploader() {
    const [secKey] = useState(() => generateAESKey());
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({});

    const updateProgress = (fileName, progress) => {
        setUploadProgress(prev => ({
            ...prev,
            [fileName]: progress
        }));
    };

    const handleUpload = async (event) => {
        try {
            setIsUploading(true);
            const files = Array.from(event.target.files);

            if (!files.length) {
                alert("Please select at least one file.");
                return;
            }

            const results = await Promise.all(
                files.map(async (file) => {
                    const uploadedData = await encrypt(file, secKey);
                    await savetoSupa(
                        uploadedData.cid,
                        secKey,
                        uploadedData.iv,
                        uploadedData.fileName,
                        uploadedData.fileSize,
                        uploadedData.fileType
                    );
                    return {
                        name: file.name,
                        cid: uploadedData.cid,
                        size: file.size
                    };
                })
            );

            setUploadedFiles(prev => [...prev, ...results]);
        } catch (error) {
            console.error("Upload failed:", error);
            alert("Failed to upload some files");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="p-4">
            <input
                type="file"
                onChange={handleUpload}
                multiple
                className="mb-4"
                disabled={isUploading}
            />

            {isUploading && <p>Uploading files...</p>}

            <div className="mt-4">
                <h3>Uploaded Files:</h3>
                <ul className="list-disc pl-5">
                    {uploadedFiles.map((file, index) => (
                        <li key={file.cid}>
                            {file.name} (CID: {file.cid})
                        </li>
                    ))}
                </ul>
            </div>

            {Object.entries(uploadProgress).map(([fileName, progress]) => (
                <div key={fileName} className="mt-2">
                    <p>{fileName}: {progress}%</p>
                    <div className="w-full bg-gray-200 rounded">
                        <div
                            className="bg-blue-600 rounded h-2"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            ))}

            {uploadedFiles.length > 0 && (
                <div className="mt-4 p-2 bg-gray-100 rounded">
                    <p>AES Key (save this securely):</p>
                    <code className="block mt-1">{secKey}</code>
                </div>
            )}
        </div>
    );
}

const savetoSupa = async (cid, secKey, iv, file_name, file_size, file_type) => {
    try {
        const { data, error } = await supabase.from("files").insert({
            cid,
            encryption_key: secKey,
            iv,
            file_name,
            file_size,
            file_type,
        });

        if (error) {
            throw new Error("error:", error)
        }
        return data;

    } catch (error) {
        console.error("Error uploading to Supabase:", error);
        throw error; //if there is an error the function will still return something
    }
}

