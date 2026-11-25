import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, Save, X } from 'lucide-react';
import { useIdentity } from '../../shared/auth/identity';
import { ApiError } from '../../shared/api/client';
import { ErrorBox } from '../../shared/ui/feedback';
import { AccountAvatar } from '../../shared/ui/account-avatar';

export function ProfileEditor({
  onSaved,
  onCancel,
}: {
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { profile, updateProfile } = useIdentity();
  const [name, setName] = useState(
    profile?.full_name_ar || profile?.full_name || '',
  );
  const [email, setEmail] = useState(profile?.email || '');
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formRef.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(undefined);
    if (name.trim().length < 2) {
      setError(new ApiError(400, 'أدخل اسمًا من حرفين على الأقل.'));
      return;
    }
    const data = new FormData();
    data.set('full_name', name.trim());
    data.set('email', email.trim());
    if (file) data.set('image', file);
    setPending(true);
    try {
      await updateProfile(data);
      onSaved();
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      ref={formRef}
      className="account-edit"
      onSubmit={save}
      aria-busy={pending}
    >
      <fieldset disabled={pending}>
        <legend className="sr-only">تعديل بيانات حسابي</legend>
        <div className="account-image-editor">
          <AccountAvatar
            src={preview || profile?.profile_photo_url}
            name={name || 'حسابي'}
          />
          <div>
            <label className="account-upload">
              <Camera size={17} aria-hidden="true" />
              اختيار صورة
              <input
                type="file"
                aria-label="الصورة الشخصية"
                accept="image/jpeg,image/png,image/webp"
                aria-describedby="account-image-help"
                onChange={(event) => {
                  const image = event.target.files?.[0];
                  if (!image) return;
                  if (
                    !['image/jpeg', 'image/png', 'image/webp'].includes(
                      image.type,
                    ) ||
                    image.size > 5 * 1024 * 1024
                  ) {
                    setError(
                      new ApiError(
                        400,
                        'اختر صورة JPG أو PNG أو WebP بحجم لا يتجاوز 5 ميغابايت.',
                      ),
                    );
                    event.target.value = '';
                    return;
                  }
                  setFile(image);
                  setError(undefined);
                }}
              />
            </label>
            <small id="account-image-help">
              JPG أو PNG أو WebP، حتى 5 ميغابايت. تُرفع الصورة عند حفظ
              التغييرات.
            </small>
            {file && (
              <span className="account-selected-file">
                {file.name}
                <button
                  type="button"
                  onClick={() => {
                    setFile(undefined);
                    const input =
                      formRef.current?.querySelector<HTMLInputElement>(
                        'input[type=file]',
                      );
                    if (input) input.value = '';
                  }}
                >
                  إلغاء اختيار الصورة
                </button>
              </span>
            )}
          </div>
        </div>
        <label>
          الاسم الكامل
          <input
            autoFocus
            autoComplete="name"
            name="full_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={200}
            required
          />
        </label>
        <label>
          البريد الإلكتروني <span className="account-optional">(اختياري)</span>
          <input
            type="email"
            autoComplete="email"
            name="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={255}
          />
        </label>
        {error ? <ErrorBox error={error} /> : null}
        <div className="account-edit-actions">
          <button type="submit">
            <Save size={17} aria-hidden="true" />
            {pending ? 'جارٍ حفظ التغييرات…' : 'حفظ التغييرات'}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            <X size={17} aria-hidden="true" />
            إلغاء
          </button>
        </div>
      </fieldset>
    </form>
  );
}
