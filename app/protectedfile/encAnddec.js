"use client";

import { useState, useEffect } from "react";
import { uploadToPinata, encryptFile, saveToSupabase, downloadAndDecrypt, deleteFile, generateAESKey, storeAESKey, createShareLink } from "@/lib/upnotaUtils";
import secureLocalStorage from "react-secure-storage";


export default function FileUploader() {
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);

    // Ensures file persistence of uploaded files
    useEffect(() => {
        const storedFiles = secureLocalStorage.getItem("uploadedFiles");
        if (storedFiles) {
            setUploadedFiles(JSON.parse(storedFiles));
        }
    }, []);

    useEffect(() => {
        if (uploadedFiles.length > 0) {
            secureLocalStorage.setItem("uploadedFiles", JSON.stringify(uploadedFiles));
        }
    }, [uploadedFiles]);

    // handles the file upload process
    // when a file is selected, it encrypts the file using the AES key, uploads it to Pinata, and saves the metadata to Supabase
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
                    const { key, keyHex } = await generateAESKey();
                    const { encryptedData, iv } = await encryptFile(file, key);
                    const cid = await uploadToPinata(encryptedData, file.name);
                    await saveToSupabase(cid, iv, file.name, file.size);
                    await storeAESKey(cid, keyHex);
                    return { name: file.name, cid, size: file.size, iv, keyHex };
                })
            );

            setUploadedFiles((prev) => [...prev, ...results]);
        } catch (error) {
            console.error("Upload failed:", error);
            alert(error.message || "Failed to upload some files");
        } finally {
            setIsUploading(false);
        }
    };


    const handleDelete = async (cid) => {
        try {
            await deleteFile(cid);
            const updatedFiles = uploadedFiles.filter(file => file.cid !== cid);  
            setUploadedFiles(updatedFiles);
            secureLocalStorage.setItem('uploadedFiles', JSON.stringify(updatedFiles)); 
        } catch (error) {
            console.error('Delete failed:', error);
            alert('Failed to delete file');
        }
    };


    return (
        <div className="max-h-screen">
            <div className="overflow-x-auto">
                <table>
                    <thead>
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium">File Name</th>
                            <th className="px-4 py-2 text-left text-xs font-medium">Size</th>
                            <th className="px-4 py-2 text-left text-xs font-medium">CID</th>
                            <th className="px-4 py-2 text-right text-xs font-medium">
                                <input
                                    type="file"
                                    onChange={handleUpload}
                                    multiple
                                    className="file:rounded-lg file:border-0 file:text-sm file:font-semibold"
                                    disabled={isUploading}
                                />
                                {isUploading && <span className="ml-2">Uploading...</span>}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {uploadedFiles.map((file) => (
                            <tr key={file.cid}>
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">{file.name}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm">{(file.size / 1024).toFixed(1)} KB</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm">{file.cid.substring(0, 8)}...</td>
                                <td className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex gap-4">
                                        <button onClick={() => downloadAndDecrypt(file.cid, file.iv, file.keyHex)}> Download </button>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const shareUrl = await createShareLink(file);
                                                    const fullUrl = `${window.location.origin}/view/${shareUrl}`;
                                                    const shareKeyUrl = `${fullUrl}#key=${file.keyHex}`; // Across device sharing

                                                    try {
                                                        await navigator.clipboard.writeText(shareKeyUrl);
                                                        alert('Share link copied! Note: Link expires in 30 seconds and can only be used once.');
                                                    } catch (clipboardError) {
                                                        console.error('Clipboard access denied:', clipboardError);
                                                        prompt(
                                                            'Copy this share link (expires in 30 seconds):',
                                                            shareKeyUrl
                                                        );
                                                    }
                                                } catch (error) {
                                                    console.error('Share failed:', error);
                                                    alert('Failed to create share link: ' + error.message);
                                                }
                                            }}
                                            className="px-3 py-1" > Share </button>
                                        <button onClick={() => handleDelete(file.cid)}> Delete </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

