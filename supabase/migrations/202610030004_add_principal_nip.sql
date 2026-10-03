-- Migration: Add principal_nip to schools table and update create_card_batch RPC

ALTER TABLE public.schools
ADD COLUMN IF NOT EXISTS principal_nip text;

-- Update create_card_batch function to store principal_nip in print_snapshot
CREATE OR REPLACE FUNCTION public.create_card_batch(
    p_school_id uuid,
    p_student_ids uuid[],
    p_batch_name text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_batch_id uuid;
    v_student record;
    v_count integer := 0;
    v_school record;
    v_batch_name text;
    v_qr_url text;
    v_token text;
BEGIN
    SELECT * INTO v_school FROM public.schools WHERE id = p_school_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'School not found: %', p_school_id;
    END IF;

    IF p_student_ids IS NULL OR array_length(p_student_ids, 1) IS NULL OR array_length(p_student_ids, 1) = 0 THEN
        RAISE EXCEPTION 'No student IDs provided';
    END IF;

    v_batch_name := COALESCE(
        NULLIF(trim(p_batch_name), ''),
        'Batch ' || to_char(now(), 'YYYY-MM-DD HH24:MI')
    );

    INSERT INTO public.card_batches (
        school_id,
        batch_name,
        total_cards,
        status,
        created_by
    ) VALUES (
        p_school_id,
        v_batch_name,
        array_length(p_student_ids, 1),
        'pending',
        p_created_by
    )
    RETURNING id INTO v_batch_id;

    FOR v_student IN
        SELECT s.*, c.name as class_name
        FROM public.students s
        LEFT JOIN public.classes c ON c.id = s.class_id
        WHERE s.id = ANY(p_student_ids)
          AND s.school_id = p_school_id
    LOOP
        v_token := encode(extensions.gen_random_bytes(16), 'hex');
        v_qr_url := 'https://aksis.co.id/verify/' || v_token;

        INSERT INTO public.card_print_queue (
            batch_id,
            school_id,
            student_id,
            qr_code_token,
            qr_code_url,
            status,
            print_snapshot
        ) VALUES (
            v_batch_id,
            p_school_id,
            v_student.id,
            v_token,
            v_qr_url,
            'queued',
            jsonb_build_object(
                'full_name', v_student.full_name,
                'nisn', v_student.nisn,
                'nis', v_student.nis,
                'class_name', v_student.class_name,
                'photo_url', v_student.photo_url,
                'school_name', v_school.name,
                'school_logo_url', v_school.logo_url,
                'principal_name', v_school.principal_name,
                'principal_nip', v_school.principal_nip,
                'principal_signature_url', v_school.principal_signature_url
            )
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'batch_id', v_batch_id,
        'batch_name', v_batch_name,
        'cards_created', v_count
    );
END;
$$;
