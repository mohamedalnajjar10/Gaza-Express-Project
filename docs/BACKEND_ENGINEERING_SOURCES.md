# مصادر مرجع مراجعة وتطوير Backend

تاريخ البحث والإعداد: 2026-11-17.

المرجع التنفيذي: [BACKEND_ENGINEERING_PROMPT.md](BACKEND_ENGINEERING_PROMPT.md).

## حدود الإسناد

تم الاطلاع على مقتطفات وفصول متاحة رسمياً وصفحات المؤلفين والناشرين ووثائق التقنيات، وليس قراءة جميع الكتب كاملة. يوضح كل سجل أدناه ما أتيح الاطلاع عليه وكيف استُخدم. الأجزاء المدفوعة غير المتاحة لم تُقرأ ولم يُنسب إليها اقتباس أو رقم صفحة.

الـprompt صياغة تطبيقية أصلية تجمع هذه المبادئ مع المعرفة الهندسية وسياق المشروع. ليس تلخيصاً كاملاً للكتب، ولا معيار امتثال، ولا تقرير تدقيق فعلي للكود. ترتيب الأولويات P0–P3 وشكل المخرجات ومعيار الإنجاز اختيارات عملية لهذا المرجع؛ ليست نصوصاً من الكتب.

الكتب تؤسس المبادئ، أما سلوك NestJS وRedis وDocker وMySQL فيجب مطابقته بوثائق النسخة المستخدمة. روابط `latest` قابلة للتغير. لا يعني تاريخ الاطلاع أن المراجع المذكورة أحدث طبعات الكتب أو أن صفحات الوثائق تطابق تلقائياً lockfile المشروع.

## الكتب والمادة المستفاد منها

### B1 — Clean Architecture

- **المؤلف:** Robert C. Martin.
- **العنوان:** Clean Architecture: A Craftsman's Guide to Software Structure and Design.
- **المادة المقروءة:** مقتطف رسمي من الكتاب عن Dependency Rule وحدود الطبقات وتمرير البيانات، منشور لدى InformIT.
- **الخلاصة المستفادة:** توجيه الاعتمادات نحو السياسات وقواعد العمل، وإبقاء التفاصيل الخارجية خارج قلب العمل، لتحسين قابلية الاختبار والتغيير.
- **التطبيق في الـprompt:** المحوران 5 و6؛ فحص الاعتمادات وحدود domain/application/infrastructure. عدم فرض الطبقات على كل CRUD إضافة سياقية إلى المرجع، وليس اقتباساً من المقتطف.
- **المصدر:** [The Clean Architecture Dependency Rule — InformIT](https://www.informit.com/articles/article.aspx?p=2832399).

### B2 — Clean Code

- **المؤلف:** Robert C. Martin.
- **العنوان:** Clean Code: A Handbook of Agile Software Craftsmanship.
- **المادة المقروءة:** وصف الناشر وفهرس الطبعة الأولى، والمقتطف الرسمي «What Is Clean Code? — There Will Be Code». يشير الفهرس إلى موضوعات الأسماء والدوال والحدود والأخطاء والاختبارات؛ لم تُقرأ كل هذه الفصول كاملة.
- **الخلاصة المستفادة:** جودة الكود مرتبطة بوضوح التعبير عن المتطلبات وسهولة الفهم والتغيير؛ الأسماء والمسؤوليات ومعالجة الأخطاء والاختبارات محاور مراجعة أساسية.
- **التطبيق في الـprompt:** المحوران 7 و20؛ مع رفض تحويل إرشادات الأسلوب إلى قيود عددية جامدة أو abstractions غير لازمة.
- **المصدران:** [صفحة الكتاب وفهرسه — InformIT](https://www.informit.com/store/clean-code-a-handbook-of-agile-software-craftsmanship-9780132350884)، [المقتطف الرسمي](https://www.informit.com/articles/article.aspx?p=1235624).

### B3 — Refactoring

- **المؤلف:** Martin Fowler، مع مساهمة Kent Beck.
- **العنوان:** Refactoring: Improving the Design of Existing Code، الطبعة الثانية، 2018.
- **المادة المقروءة:** شرح المؤلف الرسمي للكتاب ولأسلوب refactoring، وليس الكتاب كاملاً أو كامل كتالوج التحويلات.
- **الخلاصة المستفادة:** تحسين البنية عبر تغييرات صغيرة تحافظ على السلوك يقلل مخاطر التعديل ويجعل التطوير تدريجياً.
- **التطبيق في الـprompt:** المحاور 6 و7 و20 و22؛ فصل إصلاح العيب عن إعادة التصميم الواسعة، والتحقق من السلوك قبل التغيير وبعده.
- **المصدر:** [Refactoring — Martin Fowler](https://martinfowler.com/books/refactoring.html).

### B4 — Designing Data-Intensive Applications

- **المؤلف:** Martin Kleppmann.
- **الطبعة المرجعية هنا:** الأولى؛ لا يُقصد بهذا الوصف الحكم على أحدث طبعة متاحة.
- **المادة المقروءة:** موقع الكتاب الرسمي، والمعاينة المتاحة لبداية الفصل الأول «Reliable, Scalable, and Maintainable Applications» وفهرس الكتاب لدى O’Reilly.
- **الخلاصة المستفادة:** اختيار مكونات تخزين ومعالجة البيانات قائم على مفاضلات ومتطلبات الاعتمادية والتوسع والصيانة؛ قاعدة البيانات والـcache والفهرس والرسائل أجزاء ذات أدوار مختلفة.
- **التطبيق في الـprompt:** المحاور 5 و9–16؛ تحديد مصدر الحقيقة والاتساق والفشل والسعة قبل إضافة تقنيات. تفاصيل NestJS وPrisma والاختبارات المذكورة تطبيق هندسي وليست أمثلة من الكتاب.
- **المصدران:** [موقع DDIA الرسمي](https://dataintensive.net/)، [معاينة الفصل الأول — O’Reilly](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/ch01.html).

### B5 — Continuous Delivery

- **المؤلفان:** Jez Humble وDavid Farley.
- **العنوان:** Continuous Delivery: Reliable Software Releases through Build, Test, and Deployment Automation.
- **المادة المقروءة:** صفحتا Principles وPatterns على الموقع المصاحب؛ تشرح الثانية deployment pipeline وتربطه بالفصل الخامس من الكتاب. ليست قراءة كاملة للفصل الخامس.
- **الخلاصة المستفادة:** دفعات صغيرة، تغذية راجعة مبكرة، خط نشر قابل للتكرار، بناء الحزمة مرة واحدة، smoke tests، وتقليل مخاطر الإصدار.
- **التطبيق في الـprompt:** المحوران 18 و22؛ ترقية artifact نفسه، وفحوص قبل النشر وبعده، وتوافق البيانات أثناء الانتقال وخطة استرجاع واقعية.
- **المصدران:** [Continuous Delivery — Principles](https://continuousdelivery.com/principles/)، [Continuous Delivery — Patterns](https://continuousdelivery.com/implementing/patterns/).

### B6 — Site Reliability Engineering

- **الكتاب:** Site Reliability Engineering: How Google Runs Production Systems.
- **الجهة:** Google؛ تحرير Betsy Beyer وChris Jones وJennifer Petoff وNiall Richard Murphy.
- **المادة التي تمت مراجعتها:** الفهرس الرسمي ومحتوى من الفصل 4 «Service Level Objectives» والفصل 6 «Monitoring Distributed Systems» المتاحين على موقع Google SRE.
- **الخلاصة المستفادة:** تحديد مؤشرات وأهداف خدمة واضحة، وقياس latency وtraffic وerrors وsaturation، وربط المراقبة بأثر المستخدم.
- **التطبيق في الـprompt:** المحاور 5 و13 و14 و19؛ فصل الأهداف عن القياسات، وربط السعة والتشغيل بمؤشرات فعلية. تفاصيل load balancing بالمشروع تستند أيضاً إلى Nginx، لا إلى ادعاء قراءة جميع فصول SRE.
- **المصادر:** [فهرس الكتاب](https://sre.google/sre-book/table-of-contents/)، [Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)، [Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/).

### B7 — Introduction to Algorithms

- **المؤلفون:** Thomas H. Cormen وCharles E. Leiserson وRonald L. Rivest وClifford Stein؛ المعروف اختصاراً بـCLRS.
- **الطبعة:** الرابعة، MIT Press، 2022.
- **المادة المقروءة:** صفحة الناشر التعريفية؛ لم تُقرأ فصول الخوارزميات كاملة في إعداد هذا الملف.
- **الدور في المرجع:** مرجع تأسيسي لتحليل الخوارزميات وهياكل البيانات والتكلفة، لا مصدر مباشر لتفاصيل البحث العربي أو محركات البحث الحديثة.
- **التطبيق في الـprompt:** المحور 15؛ طلب تحليل الزمن والذاكرة واختيار بنية بيانات ملائمة. تفاصيل SQL والبحث النصي مرتبطة بوثائق MySQL وبمتطلبات المنتج واختبارات الصلة.
- **المصدر:** [Introduction to Algorithms, Fourth Edition — MIT Press](https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/).

### B8 — Prompt Engineering for LLMs

- **المؤلفان:** John Berryman وAlbert Ziegler.
- **الناشر:** O’Reilly.
- **المادة المقروءة:** الفهرس العام والمعاينة المتاحة لبداية الفصل 6 «Assembling the Prompt». لم تُقرأ بقية الفصل المدفوعة أو فصول التقييم كاملة.
- **الخلاصة المستفادة:** تجميع السياق وتنظيمه وانتقاء الأجزاء الملائمة ضمن حدود الحجم يساعد على وضوح الطلب.
- **التطبيق في الـprompt:** فصل المدخلات والأوضاع والقواعد والمخرجات، وتطبيق المحاور المتأثرة في المهام الصغيرة. قالب الأدلة والأولويات ومعيار الإنجاز تصميم خاص بهذا المشروع، وليس قالباً منقولاً من الكتاب.
- **المصدران:** [صفحة الكتاب وفهرسه](https://www.oreilly.com/library/view/prompt-engineering-for/9781098156145/)، [معاينة Assembling the Prompt](https://www.oreilly.com/library/view/prompt-engineering-for/9781098156145/ch06.html).

## الوثائق التقنية الرسمية

| الرمز | المصدر الذي تمت مراجعته | استخدامه في المرجع |
| --- | --- | --- |
| T1 | [NestJS — Validation](https://docs.nestjs.com/techniques/validation) | ValidationPipe وwhitelist والتحويل ورفض الحقول الزائدة؛ المحور 7 |
| T2 | [NestJS — Rate Limiting](https://docs.nestjs.com/security/rate-limiting) | throttling والتخزين وإعداد التطبيق خلف proxy؛ المحور 12، مع التحقق من الإصدار |
| T3 | [NestJS — Caching](https://docs.nestjs.com/techniques/caching) | cache keys وTTL وقيود interceptor؛ المحور 11؛ المشروع قد يستخدم adapter مخصصاً بدلاً من CacheModule |
| T4 | [OWASP API Security Top 10 — 2023](https://api-security.owasp.org/editions/2023/en/0x00-header/) | فئات التفويض والمصادقة واستهلاك الموارد وتدفقات العمل وSSRF والتكاملات؛ المحور 8؛ ليس معيار امتثال كاملاً |
| T5 | [OWASP ASVS — Overview](https://asvs.owasp.org/) | مرجع متطلبات تحقق أمنية؛ يُختار الإصدار والمستوى والمتطلبات المناسبة عند التدقيق؛ لم يُنفذ تقييم ASVS هنا |
| T6 | [Redis — Key Eviction](https://redis.io/docs/latest/develop/reference/eviction/) | مراجعة الذاكرة وسياسات الإخلاء والفصل بين استخدامات Redis؛ المحور 11 |
| T7 | [Redis — Distributed Locks](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/) | ملكية القفل وانتهاؤه وحدود الضمانات؛ المحوران 9 و11؛ المرجع لا يفرض خوارزمية قفل معينة |
| T8 | [Docker — Building Best Practices](https://docs.docker.com/build/building/best-practices/) | multi-stage والصور الأساسية وbuild context والتثبيت والاختبار؛ المحور 17 |
| T9 | [Node.js — Don't Block the Event Loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop) | حدود CPU والعمل المتزامن وevent loop/worker pool؛ المحور 14 |
| T10 | [Nginx — HTTP Load Balancing](https://nginx.org/en/docs/http/load_balancing.html) | خوارزميات التوزيع والجلسات والاعتمادات؛ المحور 13؛ الميزات تطابق بالإصدار المستخدم |
| T11 | [GitHub Actions — Secure Use Reference](https://docs.github.com/en/actions/reference/security/secure-use) | أقل الصلاحيات وأمن workflows وthird-party actions؛ المحور 18 |
| T12 | [MySQL 8.4 — Full-Text Search](https://dev.mysql.com/doc/refman/8.4/en/fulltext-search.html) | بديل SQL للبحث النصي والتحقق من إمكانات المحرك؛ المحور 15؛ لا يُفترض دعم العربية بالمستوى المطلوب دون اختبار |

هذه الروابط مراجع للفحص، وليست دعوة لترقية المشروع تلقائياً أو لاستبدال حل موجود. تحقق من محتوى المصدر ونسخة المكتبة قبل الاستشهاد بتفصيل API في مراجعة مستقبلية.

## سياق المشروع المستخدم في التخصيص

تمت معاينة بنية الملفات والوثائق التالية لإنشاء نقطة بداية تناسب Gaza Express:

- [README](../README.md): توزيع المشروع وطريقة التشغيل العامة.
- [API package.json](../apps/api/package.json): نطاق الإصدارات والأوامر والتبعيات؛ الأرقام المحلولة بدقة تحتاج مطابقة lockfile عند التنفيذ.
- [Prisma schema](../apps/api/prisma/schema.prisma): اختيار MySQL والأدوار وبداية نموذج البيانات.
- [CI workflow](../.github/workflows/ci.yml): المسارات والخدمات والفحوص المعروضة في خط التحقق.
- [Performance](PERFORMANCE.md): الوصف الحالي للـreplicas وNginx والـcache والحدود وقياسات التحميل المحلية.
- قائمة الملفات في API والاختبارات وinfra وdocs لتحديد مواضع المراجعة المستقبلية.

لم يتم في مهمة إعداد هذا المرجع تدقيق التطبيق كاملاً، أو تشغيل اختبارات backend، أو إعادة إثبات قياسات الأداء الواردة في وثائق المشروع. لذلك لا يُستنتج من هذا الملف أن هذه المكونات آمنة أو صحيحة أو جاهزة للإنتاج.

## الربط المختصر بين المحاور والمصادر

| محاور الـprompt | الأساس المرجعي |
| --- | --- |
| 1–4: تنظيم المهمة والأدلة والسياق | B8 + تصميم عملي مخصص للمراجعة + سياق المستودع |
| 5–6: system design وarchitecture | B1 وB4 |
| 7: clean code وNestJS | B2 وB3 وT1 |
| 8: security | T4 وT5 |
| 9–10: البيانات والاستعلامات | B4 + مطابقة schema وقيود محرك البيانات في المهمة الفعلية |
| 11–12: Redis/cache/rate limiting | T2 وT3 وT6 وT7 |
| 13–14: balancing/performance | B6 وT9 وT10 |
| 15: search/algorithms | B7 وT12 + متطلبات واختبارات عربية مخصصة |
| 16: jobs/reliability | B4 + تحليل فشل وتكرار خاص بالتكامل |
| 17–18: Docker وCI/CD | B5 وT8 وT11 |
| 19: observability والتشغيل | B6 |
| 20–22: التحقق والإصلاح والتسليم | B3 وB5 + معيار إنجاز مصمم لهذا المرجع |

عند تطوير المرجع لاحقاً، حدّث تاريخ التحقق والمصادر والنسخ والأسباب. لا تضف كتاباً إلى القائمة لمجرد شهرته دون تحديد ما استُخدم منه فعلياً.
