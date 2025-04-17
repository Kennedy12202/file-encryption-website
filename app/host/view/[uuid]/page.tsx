// import { createClient } from '@/utils/supabase/server'
// import { notFound } from 'next/navigation'

// export default async function ViewFile({ params }) {
//   const supabase = createClient()
//   const uuid = params.uuid

//   // Fetch the link info
//   const { data, error } = await (await supabase)
//     .from('links')
//     .select('*')
//     .eq('id', uuid)
//     .single()

//   if (error || !data || data.accessed) {
//     return notFound() // or custom 404 or "already used" page
//   }

//   // Optional: check if expired
//   if (data.expires_at && new Date(data.expires_at) < new Date()) {
//     return notFound()
//   }

//   // Mark as accessed
//   await (await supabase)
//     .from('links')
//     .update({ accessed: true })
//     .eq('id', uuid)

//   // Now retrieve the file (e.g., from IPFS)
//   const fileCID = data.pointer

//   return (
//     <div>
//       <h1>Your File</h1>
//       <a href={`https://gateway.pinata.cloud/ipfs/${fileCID}`} target="_blank" rel="noopener noreferrer">
//         Download/View
//       </a>
//     </div>
//   )
// }
