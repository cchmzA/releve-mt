# Relevé MT - GitHub APK build

هذا الإصدار مجهز ليُرفع إلى GitHub مباشرة.

## من الهاتف

1. فك ضغط الملف.
2. ارفع **محتويات المجلد** إلى جذر Repository في GitHub، وليس المجلد نفسه داخل مجلد آخر.
3. تأكد أن `package.json` ظاهر في الصفحة الرئيسية للـRepository.
4. افتح Actions وستجد `Build Relevé MT APK`.
5. اضغط Run workflow.
6. بعد نجاح العملية افتح Artifacts ثم `releve-mt-debug-apk`.

## المزامنة (مهم جداً)

أضف في GitHub: Settings → Secrets and variables → Actions

| Secret | القيمة الصحيحة |
|--------|----------------|
| `VITE_SUPABASE_URL` | `https://nuplznkawbpdcscpmqbo.supabase.co` **بدون** `/rest/v1/` |
| `VITE_SUPABASE_ANON_KEY` | مفتاح anon/public فقط (ليس service_role) |

### خطأ شائع يسبب «البريد أو كلمة المرور غير صحيحة»

إذا وضعت الرابط هكذا:
`https://nuplznkawbpdcscpmqbo.supabase.co/rest/v1/`

فسيفشل تسجيل الدخول رغم أن الحساب موجود، لأن التطبيق يضيف `/auth/v1/token` على مسار خاطئ.

الكود الآن ينظّف الرابط تلقائياً، ومع ذلك يُفضّل تصحيح الـSecret.

إذا لم تضف الـSecrets، يمكن أن ينجح بناء APK لكن المزامنة لن تعمل.
