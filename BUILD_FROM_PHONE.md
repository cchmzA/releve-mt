# إنشاء APK من الهاتف فقط

هذا المشروع مجهز للعمل مع GitHub Actions، لذلك لا تحتاج Android Studio.

## الطريقة

1. أنشئ Repository جديدًا في GitHub.
2. ارفع محتويات هذا المجلد إلى Repository.
3. من GitHub افتح: Settings → Secrets and variables → Actions.
4. أضف Secret باسم `VITE_SUPABASE_URL` وضع رابط مشروع Supabase.
5. أضف Secret باسم `VITE_SUPABASE_ANON_KEY` وضع مفتاح anon/public.
6. افتح تبويب Actions.
7. اختر `Build Relevé MT APK`.
8. اضغط `Run workflow`.
9. بعد انتهاء البناء، افتح نتيجة التشغيل ثم قسم Artifacts.
10. حمّل `releve-mt-debug-apk` وفك الضغط، ثم ثبت `app-debug.apk` على الهاتف.

لا تضع `service_role key` في GitHub Secrets أو داخل التطبيق. استعمل فقط `anon/public key`.

## ملاحظة

إذا لم تضبط Secrets، يمكن أن ينجح بناء APK لكن المزامنة مع Supabase لن تعمل. يجب ضبطهما قبل بناء النسخة التي ستستخدمها فعليًا.
