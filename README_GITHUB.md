# Relevé MT - GitHub APK build

هذا الإصدار مجهز ليُرفع إلى GitHub مباشرة.

## من الهاتف

1. فك ضغط الملف.
2. ارفع **محتويات المجلد** إلى جذر Repository في GitHub، وليس المجلد نفسه داخل مجلد آخر.
3. تأكد أن `package.json` ظاهر في الصفحة الرئيسية للـRepository.
4. افتح Actions وستجد `Build Relevé MT APK`.
5. اضغط Run workflow.
6. بعد نجاح العملية افتح Artifacts ثم `releve-mt-debug-apk`.

## المزامنة

إذا كنت تريد مزامنة الهواتف عبر Supabase، أضف في GitHub:
Settings → Secrets and variables → Actions

- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY

إذا لم تضفهما، يمكن أن يتم بناء APK لكن وظائف Supabase لن تعمل بشكل صحيح.
