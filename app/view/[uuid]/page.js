'use client';

import { use, useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase/supabaseClient';
import { downloadAndDecrypt } from '@/lib/upnotaUtils';
import secureLocalStorage from "react-secure-storage";
 

// This component handles the decryption and download of a shared file
export default function ViewSharedFile({ params }) {
    const resolvedParams = use(params);
    const uuid = resolvedParams.uuid;
    const [status, setStatus] = useState('loading');
    const [error, setError] = useState(null);

    
    useEffect(() => {
        const fetchSharedFile = async () => {
            try {
                const { data: shareLink, error: fetchError } = await supabase
                    .from('share_links')
                    .select('*')
                    .eq('id', uuid)
                    .single();

                if (fetchError || !shareLink) {
                    throw new Error('Link not found');
                }

                // Check expiration
                const now = new Date();
                const expirationDate = new Date(shareLink.expiration_timestamp);
                if (expirationDate < now) {
                    // Delete expired link
                    await supabase.from('share_links').delete().eq('id', uuid);
                    throw new Error('This link has expired');
                }

                // Check access limits
                if (shareLink.access_count >= shareLink.max_access_count) {
                    // Delete overused link
                    await supabase.from('share_links').delete().eq('id', uuid);
                    throw new Error('This link has reached its maximum number of uses');
                }

                const shareKeys = JSON.parse(secureLocalStorage.getItem('shareKeys') || '{}');
                const keyHex = shareKeys[uuid];
                if (!keyHex) {
                    throw new Error('Decryption key not found');
                }
                // Download and decrypt
                await downloadAndDecrypt(shareLink.file_cid, shareLink.iv, keyHex);
                // Update access count
                const { error: updateError } = await supabase
                    .from('share_links')
                    .update({
                        access_count: shareLink.access_count + 1,
                        accessed: shareLink.access_count + 1 >= shareLink.max_access_count
                    })
                    .eq('id', uuid);

                if (updateError) {
                    throw new Error('Failed to update access status');
                }
                // Clean up key if this was the last allowed access
                if (shareLink.access_count + 1 >= shareLink.max_access_count) {
                    delete shareKeys[uuid];
                    secureLocalStorage.setItem('shareKeys', JSON.stringify(shareKeys));
                }
                setStatus('success');
            } catch (error) {
                console.error('Error:', error);
                setError(error.message);
                setStatus('error');
            }
        };
        fetchSharedFile();
    }, [uuid]);


    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-lg">
                {status === 'loading' && (<p> Loading shared file...</p>)}
                {status === 'error' && (<p> Error: {error}</p>)}
                {status === 'success' && (<p> File downloaded successfully! You can close this page. </p> )}
            </div>
        </div>
    );
}