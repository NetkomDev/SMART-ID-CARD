import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // use service role

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('Testing RPC record_portal_library_visit...');
  
  // Find a school
  const { data: schools } = await supabase.from('schools').select('id').limit(1);
  if (!schools || !schools.length) return console.log('No schools found');
  const schoolId = schools[0].id;
  
  // Find a student
  const { data: students } = await supabase.from('students').select('id, nisn').eq('school_id', schoolId).limit(1);
  if (!students || !students.length) return console.log('No students found');
  const student = students[0];
  
  // Create an event ID
  const crypto = require('crypto');
  const eventId = crypto.randomUUID();
  
  console.log(`School: ${schoolId}, Student NISN: ${student.nisn}`);
  
  const { data, error } = await supabase.rpc('record_portal_library_visit', {
    target_school_id: schoolId,
    p_event_id: eventId,
    p_card_uid: student.nisn,
    p_occurred_at: new Date().toISOString(),
    p_local_sequence: Date.now()
  });
  
  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log('RPC Success:', data);
  }
}

test().catch(console.error);
