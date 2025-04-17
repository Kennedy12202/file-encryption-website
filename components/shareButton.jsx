"use client";

import React, { useEffect, useState } from "react";
import { getKeyHexFromIndexedDB } from "@/lib/upnotaUtils";

export default function ShareButton({ cid, iv, keyHex: initialKeyHex }) {
    const [keyHex, setKeyHex] = useState(initialKeyHex || null);

    useEffect(() => {
        if (!initialKeyHex && cid) {
            getKeyHexFromIndexedDB(cid).then((storedKeyHex) => {
                if (storedKeyHex) setKeyHex(storedKeyHex);
            });
        }
    }, [initialKeyHex, cid]);

    const handleCopy = async () => {
        if (!cid || !iv || !keyHex) {
            alert("Missing data to generate share link.");
            return;
        }

        const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
        const url = `${baseUrl}/view/${cid}?iv=${iv}&key=${keyHex}`;

        try {
            await navigator.clipboard.writeText(url);
            alert("Link copied to clipboard!");
        } catch (error) {
            console.error("Copy failed:", error);
            alert("Failed to copy the link.");
        }
    };

    return (
        <button
            onClick={handleCopy}
            className="underline text-sm"
        >
            Share
        </button>
    );
}
