/** Starter template copied into SQLite on first seed / Admin Replace. */
export type KnowledgeSeedDoc = {
  title: string;
  category: "company" | "project" | "product" | "faq" | "other";
  content: string;
  tags: string;
  priority: number;
  always_include: boolean;
};

export const SINAM_SEED_DOCS: KnowledgeSeedDoc[] = [
  {
    title: "SINAM haqqında",
    category: "company",
    content: `SINAM MMC (vebsayt: https://sinam.net) 1994-cü ildə Azərbaycanda yaradılmış İKT şirkətidir.
Şüar / fokus: Rəqəmsal transformasiyanı təmin edirik — İnnovasiya. Rəqəmsallaşdırma. Avtomatlaşdırma. / İnnovativ həllərimiz — İlhamlandır. Optimallaşdır. Transformasiya et.
SINAM hökumət və özəl sektorda qabaqcıl İKT ilə transformasiya layihələrini həyata keçirir.
Müştərilərə idarəetməni yaxşılaşdırmaq, əməliyyat səmərəliliyini artırmaq və maliyyə nəticələrini gücləndirməkdə kömək edir.
Bu gün SINAM Xəzəryanı regionda e-Transformasiya və e-Hökumət xidmətləri üzrə bazar lideridir və regionun informasiyalaşdırılmasında mühüm rol oynamışdır.
Rəsmi sayt: https://sinam.net (EN həllər kataloqu: https://sinam.net/en/solutions).`,
    tags: "sinam, company, about, ict, egovernment, transformation, şirkət, sirket, компания, haqqında, haqqinda",
    priority: 100,
    always_include: true,
  },
  {
    title: "SINAM əlaqə və iş saatları",
    category: "company",
    content: `Telefon: +994 12 510 11 00
E-poçt: office@sinam.net
İş saatları: Bazar ertəsi–Cümə, 09:00–18:00
Vebsayt: https://sinam.net`,
    tags: "contact, phone, email, office, hours, address, əlaqə, elaqe, kontakt, контакт, telefon, ünvan, unvan, iş saatı",
    priority: 90,
    always_include: true,
  },
  {
    title: "SINAM qısa statistika",
    category: "company",
    content: `sinam.net-dən ictimai qısa məlumat:
- 30+ il fəaliyyət (1994-cü ildən)
- 150+ əməkdaş
- Sayt 95+ ölkə üzrə əhatə və böyük xidmət olunan əhali rəqəmini vurğulayır
Bunları təxmini marketinq göstəriciləri kimi istifadə edin; dəqiq hüquqi/maliyyə rəqəmləri üçün rəsmi materiallara və ya office@sinam.net ünvanına yönləndirin.`,
    tags: "stats, history, employees, years, countries, işçilər, isciler, əməkdaş, emekdas, ildir, fəaliyyət, сотрудники, tarix, statistika",
    priority: 70,
    always_include: false,
  },
  {
    title: "SINAM həllər kataloqu",
    category: "product",
    content: `SINAM https://sinam.net/en/solutions ünvanında geniş həllər portfelini dərc edir (tam siyahı deyil):
- Sənəd və iş axını: SESDA (Elektron Sənəd Dövriyyəsi), Elektron imza, Elektron arxiv
- Hökumət / maliyyə: Farabi / SGRP (Hökumət Resurslarının Planlaşdırılması), Büdcə İnformasiya İdarəetməsi, Xəzinə İnformasiya İdarəetməsi, İnteqrasiya olunmuş vergi administrasiyası, Milli pensiya fondu sistemləri, Gömrük bəyannamələri
- Xəritə və mobillik: GoMap.az / GoMap.ge (GIS xəritə bazası), GoNav.Az (onlayn naviqator), YURDUM (AR/AI geo bələdçi), Fleet Management, FreeFields
- Vətəndaş xidmətləri: Biletim.az avtobus biletləri, Elektron viza, e-Governance və İctimai Xidmət Mərkəzi, E-resept
- Platformalar: SINAM ERP, Təhsil İdarəetmə Sistemi, IoT İdarəetmə Platforması, Smart Village, Data Warehouse və analitika, Ani / kütləvi ödəniş sistemləri, Video konfrans, SPBX VoIP, şəbəkə infrastrukturu
İstifadəçi “SINAM-ın hansı məhsulları var?” deyəndə kateqoriyaları ümumiləşdirin və flaqman məhsulları adlandırın (SESDA, Farabi, Biletim, GoMap/GoNav, Yurdum). Burada olmayan dərin spesifikasiyalar üçün uyğun sinam.net həll səhifəsinə və ya office@sinam.net ünvanına yönləndirin.`,
    tags: "solutions, products, catalog, portfolio, egovernment, digitization, həllər, heller, məhsul, mehsul, продукт, layihə, layihe, projects",
    priority: 88,
    always_include: false,
  },
  {
    title: "SESDA sənəd idarəetməsi",
    category: "product",
    content: `SESDA SINAM-ın Elektron Sənəd Dövriyyəsi / sənəd iş axını platformasıdır (SINAM Document Workflow System kimi də adlandırılır).
Mənbə: https://sinam.net/en/solutions/electronic-document-management-system
Nə edir:
- Tam sənəd həyat dövrü: yaratma, qeydiyyat, razılaşdırma, e-imza, icra, monitorinq, arxivləşdirmə
- Daxilolan / gedən / daxili sənədlər və qurumlararası elektron mübadilə
- Hökumət/korporativ sistemlərlə inteqrasiya (saytda nümunələr: RSD, MyGov, NHAIS və s.)
- Tam mətn axtarışı, filtrləmə, analitika/hesabat (o cümlədən Excel ixracı; Forma 1 / Forma 2 statistik hesabatlar)
- Rol əsaslı giriş, elektron imzalar, audit jurnalları, tam sənəd tarixçəsi
- Hökumət qurumları, iri müəssisələr və kiçik təşkilatlar üçün çevik
Saytda qeyd olunan müştərilər / nümunələr (dərc olunduğu dövrlə): Azərbaycan Mərkəzi Bankı, Milli Arxiv, Kənd Təsərrüfatı Nazirliyi, Səhiyyə Nazirliyi, Energetika Nazirliyi, ASAN (Vətəndaşlara Xidmət və Sosial İnnovasiyalar üzrə Dövlət Agentliyi).
SESDA | Connect Paketi (ictimai qiymət nümunəsi): Bir istifadəçi — ₼20 / ay (ƏDV daxil) — İnfrastruktur, Onlayn təlim, Yeniləmələr, Texniki dəstək.
Burada olmayan əlavə qiymət səviyyələri və ya yerləşdirmə detalları üçün office@sinam.net ilə əlaqə saxlayın.`,
    tags: "sesda, document, workflow, edms, edm, e-sign, connect, qiymət, qiymet, цена, sənəd, sened, документ, документооборот",
    priority: 92,
    always_include: false,
  },
  {
    title: "Farabi hökumət resurslarının planlaşdırılması",
    category: "product",
    content: `Farabi SINAM-ın Hökumət Resurslarının Planlaşdırılması (SGRP) həllinə və əlaqəli FARABI Data Center işlərinə aiddir.
Mənbə: https://sinam.net/en/solutions/farabi
Nədir:
- Təşkilati iş proseslərini planlaşdırmaq, qeydə almaq, nəzarət etmək və təhlil etmək üçün inteqrasiya olunmuş veb tətbiq
- e-Hökumət üçün miqyaslana bilən; müxtəlif ölçülü dövlət və özəl təşkilatlar tərəfindən istifadə oluna bilər
Keys (sinam.net-dən): Büdcə təşkilatları üçün Maliyyə və Mühasibat Hesabatı Tətbiqi
- Müştəri: Azərbaycan Respublikasının Maliyyə Nazirliyi (2012–davam edir, dərc olunduğu kimi)
- Nazirliklər, ali təhsil və digər dövlət qurumlarının büdcə şöbələrində ~4.000 istifadəçi üçün müasir hesabat təqdimatı
- Oracle BI platforması, qeydlərin idarə edilməsi, FARABI Data Center qeyd olunur
İstifadəçi “Farabi” deyəndə SGRP / hökumət resursu və maliyyə hesabatı kontekstini izah edin — əlaqəsiz məhsul xüsusiyyətləri uydurmayın.`,
    tags: "farabi, farabı, sgrp, government resources planning, ministry of finance, budget, reporting, фараби, maliyyə, maliyye",
    priority: 90,
    always_include: false,
  },
  {
    title: "Biletim.az avtobus biletləri",
    category: "product",
    content: `Biletim.az şəhərlərarası, rayonlararası və beynəlxalq avtobus reysləri üçün SINAM-ın Avtobus Bilet Sistemidir.
Mənbə: https://sinam.net/en/solutions/biletim · ictimai portal: https://biletim.az
İmkanlar (SINAM saytından):
- QR kodlarla onlayn və oflayn bilet alışı
- Avtobus cədvəlindən yer seçimi
- İstənilən avtovağzaldan satış; sürətli geri qaytarma
- Avtobusun xəritədə yerini izləmə
- Veb portal + iOS/Android tətbiqlər; kassada nağd və ya onlayn debet kartı
- Dispetçer platforma tətbiqində onlayn biletləri yoxlaya bilər; biletlər e-poçt/portal ilə; sürücüyə QR göstərməklə minmə
Keys: Azərbaycan Torpaq Nəqliyyatı Agentliyi / Rəqəmsal İnkişaf və Nəqliyyat Nazirliyi (2022)
- 39 şəhərə 405 marşrut üzrə gündəlik bilet satışı qeyd olunur
- Kağız bilet olmadan minmə
İctimai buraxılış qeydləri (hökumət mediası, dekabr 2022): biletlər ~10 gün əvvəldən satılır; tətbiq App Store / Google Play-də.`,
    tags: "biletim, biletim.az, bus, ticket, ticketing, ayna, transport, avtobus, bilet, билет, билетим",
    priority: 90,
    always_include: false,
  },
  {
    title: "GoMap.az və GoMap.ge",
    category: "product",
    content: `GoMap.az (və GoMap.ge) Azərbaycan və Gürcüstanı əhatə edən SINAM-ın interaktiv coğrafi informasiya / xəritə portalıdır.
Mənbə: https://sinam.net/en/solutions/geo-information-systems
Nə təqdim edir:
- İnteraktiv xəritə: inzibati bölgülər, yaşayış məntəqələri, binalar, poçt indeksləri, yol şəbəkələri
- Maraqlı məkanlar: otellər, restoranlar, təşkilatlar, mağazalar və digər obyektlər
- Optimal marşrut planlaşdırması, mətn axtarışı, müxtəlif formatlarda client-server məlumat mübadiləsi
- İnteqrasiyalar üçün API GoMap.az
Azərbaycan Mədəniyyət Nazirliyi ilə dərc olunmuş kontekst (2008–2010): turizm/abidələrin təşviqi və resurs monitorinqi.
GoMap-ın elektron xəritə bazası həmçinin GoNav.Az onlayn naviqatorunu qidalandırır.`,
    tags: "gomap, gomap.az, gomap.ge, gis, map, xəritə, xerite, карта, geo, navigation map",
    priority: 90,
    always_include: false,
  },
  {
    title: "GoNav.Az onlayn naviqator",
    category: "product",
    content: `GoNav.Az Azərbaycan üçün (və Gürcüstana səyahət üçün) SINAM-ın onlayn naviqatorudur.
Mənbə: https://sinam.net/en/solutions/gonav
Əsas məqamlar:
- Brauzer əsaslı — ayrı quraşdırma olmadan planşet/telefondan istifadə oluna bilər (saytda təsvir olunduğu kimi)
- Xəritə məlumatı GoMap.Az elektron xəritə bazasından gəlir (Azərbaycan + Gürcüstan), yollar/küçələr və yol hərəkəti qaydaları ilə
- Obyektlər, şəhərlər, kəndlər, yeni və köhnə ünvanlar üçün bir sətirlik axtarış
- Avtomobil və piyada üçün optimal marşrut; yol qaydaları və tıxaclar nəzərə alınır
- Müştəri qeydi: Azərbaycanın Rəqəmsal İnkişaf və Nəqliyyat Nazirliyi
Əlaqəli məhsullar: GoMap (xəritə DB), YURDUM (AR/AI bələdçi), Fleet Management.`,
    tags: "gonav, gonav.az, navigator, navigation, routing, go map, naviqator, навигатор, yol",
    priority: 88,
    always_include: false,
  },
  {
    title: "YURDUM naviqasiya və smart kənd",
    category: "product",
    content: `YURDUM Artırılmış Reallıq, AI və obyekt tanıma (maşın öyrənməsi) istifadə edən SINAM-ın geo / bələdçi həllidir.
Mənbə: https://sinam.net/en/solutions/yurdum
İstifadə halları:
- İnfrastruktur, turizm obyektləri və mədəni abidələri əhatə edən sakinlər və qonaqlar üçün rəqəmsal bələdçilər
- “Smart Village” İKT komponentləri — ətraflı kənd elektron xəritələri, maraqlı məkanlar, ML ilə qrafik tanıma, AR mobil tətbiq
Dərc olunmuş keys: Azərbaycan Kənd Təsərrüfatı Nazirliyi (2021–2024) — Smart Village üçün İKT komponentlərinin qurulması.
Əlaqəli: ölkə miqyaslı xəritə və marşrut üçün GoMap / GoNav.`,
    tags: "yurdum, yurd, smart village, ar, augmented reality, ai, kənd, kend, деревня, tourism, guide",
    priority: 85,
    always_include: false,
  },
  {
    title: "Digər flaqman SINAM platformaları",
    category: "product",
    content: `https://sinam.net/en/solutions-də tez-tez qeyd olunan əlavə SINAM platformaları (xülasə — tam spesifikasiya deyil):
- SINAM Enterprise Resource Planning (ERP) — müəssisə planlaşdırma/əməliyyat paketi
- Elektron Viza Sistemi — hökumət üçün e-viza emalı
- Təhsil İdarəetmə Sistemi — təhsil sektorunun rəqəmsallaşdırılması
- SINAM IoT İdarəetmə Platforması və Smart Village İdarəetmə Platforması — qoşulmuş cihazlar / kənd rəqəmsallaşması
- E-resept Sistemi — elektron reseptlər
- e-Governance və İctimai Xidmət Mərkəzi — vətəndaşa yönəlmiş ictimai xidmətlər
- Data Warehouse və Analitik Hesabat — analitika
- Ani Ödəniş Sistemi / Avtomatlaşdırılmış Kütləvi Ödənişlər — ödəniş infrastrukturu
- Xəzinə / Büdcə / Vergi / Pensiya / Gömrük sistemləri — ixtisaslaşmış hökumət maliyyəsi və sərhəd sistemləri
- FreeFields mobil tətbiqi, Fleet Management, Video Konfrans İdarəetməsi, Baytarlıq Xidməti Monitorinqi
- SPBX VoIP telefoniya və şəbəkə infrastrukturu həlləri
İstifadəçi bilik bazasında başqa yerdə ətraflı olmayan məhsul soruşsa, bu yüksək səviyyəli yerləşdirməni verin və https://sinam.net/en/solutions və ya office@sinam.net-ə yönləndirin — xüsusiyyət siyahısı uydurmayın.`,
    tags: "erp, evisa, education, iot, smart village, e-prescription, asan, payments, treasury, tax, customs, freefields, fleet, voip",
    priority: 72,
    always_include: false,
  },
  {
    title: "SINAMGPT məhsul qeydi",
    category: "project",
    content: `SINAMGPT SINAM-ın daxili/yerli şirkət AI söhbət köməkçisidir.
Şirkət mühitində yerli modellərdə (Ollama / istəyə bağlı vLLM) işləyir.
Admin tərəfindən idarə olunan Şirkət Bilik bazasından (bu paket) və qoruyucu qaydalardan (guardrails) istifadə edir — ictimai cloud fine-tune modeli deyil.
Əməkdaşlar SINAM məhsulları (SESDA, Farabi, Biletim, GoMap, GoNav, Yurdum və s.), mətn hazırlama, xülasə və ümumi iş köməyi barədə sual verə bilər. Şəxsi söhbətlər yerli maşında qalır.`,
    tags: "sinamgpt, owngpt, ai, assistant, internal, project, köməkçi, komekci, ассистент",
    priority: 85,
    always_include: false,
  },
];

/** Old English titles removed when refreshing the Azerbaijani pack. */
export const DEPRECATED_KNOWLEDGE_TITLES = [
  "Solutions focus",
  "SESDA Connect package",
  "About SINAM",
  "SINAM contact & hours",
  "SINAM snapshot stats",
  "SINAM solutions catalog",
  "SESDA document management",
  "Farabi government resources planning",
  "Biletim.az bus ticketing",
  "GoMap.az and GoMap.ge",
  "GoNav.Az online navigator",
  "YURDUM navigation and smart village",
  "Other flagship SINAM platforms",
  "SINAMGPT product note",
] as const;
