// /// <reference types="https://esm.sh/@supabase/functions-js@1.0.2" />

// import { serve } from "https://deno.land/x/supabase_functions@1.0.3/mod.ts";
// import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

// const supabaseURL = Deno.env.get("SUPABASE_URL")!;
// const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// const supabase = createClient(supabaseURL, supabaseServiceRoleKey);

// serve(async (req: Request) => {
//   try {
//     const body = await req.json();
//     console.log("Received body:", body);

//     const { error } = await supabase
//       .from("userfiles")
//       .insert({ name: body.name });

//     if (error) {
//       return new Response(`Insert error: ${error.message}`, { status: 500 });
//     }

//     return new Response("Insert successful", { status: 200 });
//   } catch (error) {
//     return new Response(`Error: ${error}`, { status: 500 });
//   }
// });
