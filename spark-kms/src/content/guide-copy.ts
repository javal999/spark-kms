/**
 * Bilingual prose for /guide ("How SPARK works") — D29.
 *
 * Every key carries both languages, so a section cannot exist in English and
 * not in Indonesian. tests/unit/guide.test.ts asserts that parity.
 *
 * What is NOT here, deliberately: point values, enum lists, template columns
 * and upload limits. D26 makes reading those from the modules that own them the
 * whole point of the page, and they render identically in both languages.
 * Field names, enum values and stream labels are data, so the Indonesian copy
 * keeps them in English exactly as the rest of the product shows them.
 *
 * Register: business Indonesian as a Jakarta office writes it. Where the
 * English word is the one a colleague would actually say — dashboard, upload,
 * template, leaderboard, admin, follow-up, initiative — the Indonesian copy
 * keeps the English word rather than reaching for a formal coinage.
 *
 * Markup inside a string: **bold** only, plus {name} placeholders filled at
 * render time. Both are handled by the guide page.
 */

export const LANGS = ["en", "id"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "en";

/** Query-string value → language. Anything unrecognised falls back to English. */
export function resolveLang(value?: string): Lang {
  return (LANGS as readonly string[]).includes(value ?? "")
    ? (value as Lang)
    : DEFAULT_LANG;
}

type Entry = { en: string; id: string };

export const GUIDE_COPY = {
  "page.title": {
    en: "How SPARK works",
    id: "Cara kerja SPARK",
  },
  "page.intro": {
    en: "Every rule and every capability, in plain language. The numbers on this page are read from the running system, so what you see here is what the app is actually doing.",
    id: "Semua aturan dan semua fitur, dalam bahasa yang sederhana. Angka di halaman ini dibaca langsung dari sistem yang sedang berjalan, jadi yang Anda lihat di sini memang yang sedang dijalankan aplikasi.",
  },
  "lang.label": { en: "Language", id: "Bahasa" },
  "lang.en": { en: "English", id: "English" },
  "lang.id": { en: "Bahasa Indonesia", id: "Bahasa Indonesia" },
  "nav.heading": { en: "On this page", id: "Di halaman ini" },

  "toc.what": { en: "What SPARK is", id: "Apa itu SPARK" },
  "toc.roles": { en: "Who can do what", id: "Siapa bisa apa" },
  "toc.points": { en: "How points work", id: "Cara poin bekerja" },
  "toc.corrections": { en: "Correcting a score", id: "Memperbaiki skor" },
  "toc.submitting": { en: "Submitting", id: "Submit" },
  "toc.upload": { en: "Bulk upload", id: "Bulk upload" },
  "toc.duplicates": { en: "Duplicate detection", id: "Deteksi duplikat" },
  "toc.leaderboard": { en: "The leaderboard", id: "Leaderboard" },
  "toc.dashboard": { en: "The dashboard", id: "Dashboard" },
  "toc.everything": { en: "Everything else", id: "Fitur lainnya" },
  "toc.changes": { en: "Changing a rule", id: "Mengubah aturan" },

  "sec.what": { en: "What SPARK is", id: "Apa itu SPARK" },
  "sec.roles": { en: "Who can do what", id: "Siapa bisa apa" },
  "sec.points": { en: "How points work", id: "Cara poin bekerja" },
  "sec.corrections": { en: "Correcting a score", id: "Memperbaiki skor" },
  "sec.submitting": {
    en: "Submitting an initiative or an update",
    id: "Submit initiative atau progress update",
  },
  "sec.upload": { en: "Bulk upload", id: "Bulk upload" },
  "sec.duplicates": { en: "Duplicate detection", id: "Deteksi duplikat" },
  "sec.leaderboard": {
    en: "How the leaderboard is worked out",
    id: "Cara leaderboard dihitung",
  },
  "sec.dashboard": {
    en: "How the dashboard numbers are worked out",
    id: "Cara angka di dashboard dihitung",
  },
  "sec.everything": {
    en: "Everything else on the site",
    id: "Fitur lain di aplikasi ini",
  },
  "sec.changes": {
    en: "When a rule needs to change",
    id: "Kalau ada aturan yang perlu diubah",
  },

  "what.p1": {
    en: "SPARK is the shared record of what the regions are trying, what is working, and what is stuck. It replaced the weekly update spreadsheet. Everything that used to live in a row of that sheet now lives here as an **initiative** with a running history of **progress updates** attached to it.",
    id: "SPARK adalah catatan bersama tentang apa yang sedang dicoba tiap region, apa yang berhasil, dan apa yang masih mentok. SPARK menggantikan spreadsheet weekly update. Semua yang dulu jadi satu baris di sheet itu sekarang ada di sini sebagai satu **initiative**, lengkap dengan riwayat **progress update** yang menempel padanya.",
  },
  "what.p2": {
    en: "Three things sit on top of that record: a searchable library so a region can find what another region already tried, a point system that recognises the people keeping it current, and an area leaderboard that shows which parts of the business are contributing.",
    id: "Ada tiga hal yang dibangun di atas catatan itu: library yang bisa dicari supaya satu region bisa menemukan apa yang sudah dicoba region lain, sistem poin yang mengapresiasi orang-orang yang rajin memperbaruinya, dan leaderboard per area yang menunjukkan bagian bisnis mana yang berkontribusi.",
  },
  "what.p3": {
    en: "It is not a performance appraisal tool and not a task tracker. Points measure how much knowledge you put in, not how well the initiative performed.",
    id: "SPARK bukan alat penilaian kinerja dan bukan task tracker. Poin mengukur seberapa banyak pengetahuan yang Anda masukkan, bukan seberapa bagus hasil initiative-nya.",
  },

  "roles.p1": {
    en: "Everyone signs in with their Microsoft work account. Only accounts on the access list can get in, and that list also decides which of the three roles you get.",
    id: "Semua orang masuk dengan akun kerja Microsoft. Hanya akun yang ada di daftar akses yang bisa masuk, dan daftar itu juga yang menentukan Anda dapat role yang mana dari tiga role yang ada.",
  },
  "roles.col.can": { en: "Can", id: "Bisa" },
  "roles.col.viewer": { en: "Viewer", id: "Viewer" },
  "roles.col.admin": { en: "Admin", id: "Admin" },
  "roles.col.super": { en: "Super admin", id: "Super admin" },
  "roles.yes": { en: "Yes", id: "Ya" },
  "roles.row.read": {
    en: "Read initiatives, leaderboard, dashboard",
    id: "Membaca initiative, leaderboard, dan dashboard",
  },
  "roles.row.add": {
    en: "Add initiatives and progress updates",
    id: "Menambah initiative dan progress update",
  },
  "roles.row.upload": {
    en: "Bulk upload a spreadsheet",
    id: "Bulk upload dari spreadsheet",
  },
  "roles.row.archive": {
    en: "Archive and restore an initiative",
    id: "Mengarsipkan dan memulihkan initiative",
  },
  "roles.row.adjust": {
    en: "Correct a score with an adjustment",
    id: "Memperbaiki skor lewat adjustment",
  },
  "roles.row.insights": {
    en: "See usage insights",
    id: "Melihat usage insights",
  },
  "roles.row.manage": {
    en: "Manage access, API keys and the error log",
    id: "Mengelola akses, API key, dan error log",
  },
  "roles.row.graph": {
    en: "Open the knowledge graph",
    id: "Membuka knowledge graph",
  },
  "roles.p2": {
    en: "If a colleague loses their access, the change takes effect on their very next click, not whenever their session happens to expire.",
    id: "Kalau ada rekan yang aksesnya dicabut, perubahannya berlaku di klik berikutnya, bukan menunggu sesinya habis sendiri.",
  },

  "points.p1": {
    en: "There are two point streams, and they mean different things. **{bp}** holds the weekly award and nothing else. **{contrib}** holds every point you earn by keeping the record up to date. An area's total is simply the two added together.",
    id: "Ada dua stream poin, dan artinya berbeda. **{bp}** hanya berisi award mingguan, tidak ada yang lain. **{contrib}** berisi semua poin yang Anda dapat dari menjaga catatan tetap ter-update. Total sebuah area adalah penjumlahan keduanya.",
  },
  "points.col.what": { en: "What you did", id: "Yang Anda lakukan" },
  "points.col.points": { en: "Points", id: "Poin" },
  "points.col.stream": { en: "Stream", id: "Stream" },
  "earn.new_initiative.what": {
    en: "You add a new initiative",
    id: "Anda menambah initiative baru",
  },
  "earn.new_initiative.rule": {
    en: "Counted once, when the initiative is created. The first progress update you write at the same time is included in this point, so creating an initiative earns one point in total, not two.",
    id: "Dihitung satu kali, saat initiative dibuat. Progress update pertama yang Anda tulis bersamaan sudah termasuk di dalam poin ini, jadi membuat initiative bernilai satu poin saja, bukan dua.",
  },
  "earn.entry.what": {
    en: "You add a progress update to an initiative that already exists",
    id: "Anda menambah progress update ke initiative yang sudah ada",
  },
  "earn.entry.rule": {
    en: "Only the first update you add to that initiative on a given date counts. Three updates on the same initiative on the same day still earn one point. Best Practice and Unlocking earn the same — naming a blocker is worth as much as reporting a win.",
    id: "Hanya update pertama yang Anda tambahkan ke initiative itu pada satu tanggal yang dihitung. Tiga update di initiative yang sama pada hari yang sama tetap satu poin. Best Practice dan Unlocking bernilai sama — menyebutkan hambatan sama berharganya dengan melaporkan keberhasilan.",
  },
  "earn.bp_of_week.what": {
    en: "Your update is marked Best Practice of the Week",
    id: "Update Anda ditandai sebagai Best Practice of the Week",
  },
  "earn.bp_of_week.rule": {
    en: "Awarded straight away when the box is ticked, with no separate confirmation step. Only one can be awarded per area per week — the first one ticked in that area that week takes it, and later ones score nothing.",
    id: "Langsung diberikan begitu kotaknya dicentang, tanpa langkah konfirmasi terpisah. Hanya satu yang bisa diberikan per area per minggu — yang pertama dicentang di area itu pada minggu itu yang dapat, sisanya tidak menghasilkan poin.",
  },
  "points.p2": {
    en: "Nothing else earns points automatically. There is no point for simply presenting, and there is no weekly points allocation an admin hands out. If a number moved, one of the three rows above caused it, or somebody posted an adjustment.",
    id: "Tidak ada hal lain yang menghasilkan poin secara otomatis. Tidak ada poin hanya karena presentasi, dan tidak ada jatah poin mingguan yang dibagikan admin. Kalau ada angka yang berubah, penyebabnya salah satu dari tiga baris di atas, atau ada yang memposting adjustment.",
  },
  "points.p3": {
    en: "**Best Presenter of the Week has been retired.** The award is gone from the form and from the upload template, and every point it ever granted has been taken back, so no initiative still carries one. Area totals dropped by exactly the number of those awards. The old records are kept so the history can still be read, they just no longer count.",
    id: "**Best Presenter of the Week sudah dihentikan.** Award-nya sudah hilang dari form dan dari template upload, dan semua poin yang pernah diberikannya sudah ditarik kembali, jadi tidak ada initiative yang masih membawanya. Total area turun persis sebanyak jumlah award tersebut. Catatan lamanya tetap disimpan supaya riwayatnya masih bisa dibaca, hanya saja sudah tidak dihitung.",
  },

  "corrections.p1": {
    en: "Scores are kept as a list of everything that ever happened, and that list is only ever added to. Nothing is edited and nothing is deleted. When something has to be undone, an opposite entry is written next to it that cancels it out, and both stay visible.",
    id: "Skor disimpan sebagai daftar semua hal yang pernah terjadi, dan daftar itu hanya bisa ditambah. Tidak ada yang diedit dan tidak ada yang dihapus. Kalau ada yang harus dibatalkan, ditulis satu baris berlawanan di sebelahnya yang menihilkannya, dan keduanya tetap terlihat.",
  },
  "corrections.p2": {
    en: "That is why totals are never stored anywhere: every number you see is added up fresh from that list each time the page loads. It also means the answer to “why does this area have this many points?” is always available in full.",
    id: "Karena itu total tidak pernah disimpan di mana pun: setiap angka yang Anda lihat dijumlahkan ulang dari daftar itu setiap kali halaman dimuat. Artinya juga, pertanyaan “kenapa area ini poinnya segini?” selalu bisa dijawab lengkap.",
  },
  "corrections.p3": {
    en: "If a score is wrong, any admin can post an **adjustment** from the Adjustments page. You choose the area, the stream and the number of points, positive or negative, and you must write a note saying why. The note and your name are kept with it. This is the proper route for a dispute from a region — do not work around it by adding an initiative that did not happen.",
    id: "Kalau ada skor yang salah, admin mana pun bisa memposting **adjustment** dari halaman Adjustments. Anda pilih area, stream, dan jumlah poinnya, positif atau negatif, dan wajib menulis catatan alasannya. Catatan dan nama Anda ikut tersimpan. Ini jalur resmi untuk keberatan dari region — jangan diakali dengan menambah initiative yang sebenarnya tidak terjadi.",
  },

  "submitting.p1": {
    en: "The Submit page has two paths. **New initiative** creates the topic and its first progress update together. **Add to an existing initiative** attaches an update to something already in the library. Which one you pick decides the points, so search before you create.",
    id: "Halaman Submit punya dua jalur. **New initiative** membuat topiknya sekaligus progress update pertamanya. **Add to an existing initiative** menempelkan update ke sesuatu yang sudah ada di library. Pilihan Anda menentukan poinnya, jadi cari dulu sebelum membuat yang baru.",
  },
  "submit.col.field": { en: "Field", id: "Field" },
  "submit.col.required": { en: "Required", id: "Wajib" },
  "submit.col.means": { en: "What it means", id: "Artinya" },
  "submit.required.yes": { en: "Yes", id: "Ya" },
  "submit.required.no": { en: "No", id: "Tidak" },
  "submit.region": {
    en: "Where the work happened. Half of the area your points land in.",
    id: "Tempat pekerjaannya terjadi. Setengah dari area tempat poin Anda masuk.",
  },
  "submit.segment": {
    en: "Which brand segment the work belongs to. The other half of the area.",
    id: "Segment brand yang menaungi pekerjaan ini. Setengahnya lagi dari area.",
  },
  "submit.title": {
    en: "What the initiative is, in a few words. This is what gets checked for duplicates, so write it the way a colleague would search for it.",
    id: "Initiative ini tentang apa, dalam beberapa kata. Bagian inilah yang dicek untuk duplikat, jadi tulis seperti cara rekan Anda akan mencarinya.",
  },
  "submit.description": {
    en: "Background on the initiative as a whole. Write it once, when you create it.",
    id: "Latar belakang initiative secara keseluruhan. Ditulis sekali saja, saat membuatnya.",
  },
  "submit.pillar": {
    en: "Which strategic pillar the initiative serves. Set on the initiative, not on each update.",
    id: "Pillar strategis yang dilayani initiative ini. Diisi di initiative-nya, bukan di tiap update.",
  },
  "submit.pic": {
    en: "The person accountable for it. Anyone new here is added to the people directory automatically.",
    id: "Orang yang bertanggung jawab atasnya. Nama baru otomatis ditambahkan ke direktori people.",
  },
  "submit.stage": {
    en: "How far along it is. Left blank, it starts at Idea.",
    id: "Sudah sejauh mana progresnya. Kalau dikosongkan, mulainya dari Idea.",
  },
  "submit.date": {
    en: "The date the progress happened, not the date you type it in. Backdating is allowed; more than 30 days back shows a warning but still saves.",
    id: "Tanggal saat progresnya terjadi, bukan tanggal Anda mengetiknya. Backdate boleh; lebih dari 30 hari ke belakang akan memunculkan peringatan, tapi tetap tersimpan.",
  },
  "submit.category": {
    en: "Whether this update is a Best Practice or an Unlocking.",
    id: "Apakah update ini Best Practice atau Unlocking.",
  },
  "submit.progress": {
    en: "What actually happened. This is the knowledge other regions come here to read.",
    id: "Apa yang sebenarnya terjadi. Bagian inilah yang dibaca region lain saat mereka ke sini.",
  },
  "submit.followup": {
    en: "Anything still outstanding. Filling this in creates an action item, assigned to the PIC.",
    id: "Apa saja yang masih menggantung. Kalau diisi, akan terbentuk action item yang ditugaskan ke PIC.",
  },
  "submit.bpow": {
    en: "Tick only if this is the one you are putting forward for the week. It awards points immediately.",
    id: "Centang hanya kalau ini yang Anda ajukan untuk minggu itu. Poinnya langsung diberikan.",
  },
  "submit.link": {
    en: "A deck, photo or file that backs up the update.",
    id: "Deck, foto, atau file yang mendukung update ini.",
  },
  "submitting.p2": {
    en: "The dropdowns accept these values and nothing else, because the leaderboard and the filters only work if everyone uses the same words:",
    id: "Dropdown-nya hanya menerima nilai berikut dan tidak yang lain, karena leaderboard dan filter baru jalan kalau semua orang memakai istilah yang sama:",
  },

  "upload.p1": {
    en: "To load a batch, download the template from the Submit page and fill in the Entries sheet. One row is one progress update on one date, the same shape as the old weekly sheet. Use the template rather than your own file: its dropdowns are generated from the live lists above, so they cannot go out of date. The current version is **{version}**, and an older file still uploads — the columns are matched by their heading, not their position, so you get a warning rather than a rejection.",
    id: "Untuk memasukkan banyak data sekaligus, download template dari halaman Submit lalu isi sheet Entries. Satu baris adalah satu progress update pada satu tanggal, bentuknya sama seperti weekly sheet yang lama. Pakai template-nya, jangan file bikinan sendiri: dropdown di dalamnya dibuat dari daftar hidup di atas, jadi tidak bisa basi. Versi saat ini **{version}**, dan file versi lama tetap bisa diupload — kolomnya dicocokkan lewat judulnya, bukan posisinya, jadi Anda dapat peringatan, bukan penolakan.",
  },
  "upload.p2": {
    en: "The template columns are:",
    id: "Kolom template-nya:",
  },
  "upload.p3": {
    en: "Uploading happens in two steps. First a **preview**: nothing is saved, and you get a row-by-row report of anything invalid plus any rows that look like something already in the library. Then a **commit**, which is all or nothing — if one row fails, the whole file is rejected and you fix and re-upload. Before you can commit, you must tick the box confirming you reviewed the similar initiatives it found.",
    id: "Upload jalan dua langkah. Pertama **preview**: belum ada yang disimpan, dan Anda dapat laporan baris per baris untuk apa pun yang tidak valid, plus baris yang mirip dengan sesuatu yang sudah ada di library. Lalu **commit**, yang sifatnya semua atau tidak sama sekali — kalau satu baris gagal, seluruh file ditolak, Anda perbaiki lalu upload ulang. Sebelum bisa commit, Anda wajib mencentang kotak konfirmasi bahwa Anda sudah memeriksa initiative serupa yang ditemukan.",
  },
  "upload.p4": {
    en: "Limits: {rows} rows and {mb} MB per file. The same file cannot be committed twice, so an accidental double upload is blocked rather than doubling everyone's points. Ticking Best Practice of the Week on every row does not multiply the award, because the one-per-area-per-week cap still applies.",
    id: "Batasannya: {rows} baris dan {mb} MB per file. File yang sama tidak bisa di-commit dua kali, jadi upload dobel karena tidak sengaja akan diblokir, bukan menggandakan poin semua orang. Mencentang Best Practice of the Week di semua baris tidak melipatgandakan award, karena batas satu per area per minggu tetap berlaku.",
  },

  "duplicates.p1": {
    en: "Whenever a new topic is about to be created, by form or by upload, SPARK compares its title against every initiative already in the library. It ignores capitals and punctuation and looks for overlapping fragments of text, so “Pop-up store Make Over” and “pop up store makeover” find each other. Anything more than about {pct}% similar is shown to you, up to three suggestions, closest first.",
    id: "Setiap kali ada topik baru yang akan dibuat, lewat form maupun lewat upload, SPARK membandingkan judulnya dengan semua initiative yang sudah ada di library. Huruf besar-kecil dan tanda baca diabaikan, dan yang dicari adalah potongan teks yang bertumpang tindih, jadi “Pop-up store Make Over” dan “pop up store makeover” bisa saling menemukan. Apa pun yang kemiripannya di atas sekitar {pct}% akan ditampilkan ke Anda, maksimal tiga saran, yang paling mirip di atas.",
  },
  "duplicates.p2": {
    en: "Nothing is ever merged automatically. You are being asked one question: is this the same topic as one of these, or genuinely new? Choosing an existing one attaches your update to it and earns the update point. Choosing new creates a fresh initiative. Getting this right is what keeps one region's work findable by another, which is the whole point of the library.",
    id: "Tidak pernah ada yang digabung otomatis. Anda hanya ditanya satu hal: ini topik yang sama dengan salah satunya, atau memang benar-benar baru? Memilih yang sudah ada akan menempelkan update Anda ke situ dan tetap dapat poin update. Memilih yang baru akan membuat initiative baru. Menjawab ini dengan benar adalah yang membuat pekerjaan satu region bisa ditemukan region lain, dan itu inti dari library ini.",
  },

  "leaderboard.p1": {
    en: "The leaderboard ranks **areas**, not people. An area is one region paired with one segment, so “Sumatera · Masstige” is a different area from “Sumatera · Halal PC”. Only areas that have at least one initiative appear at all.",
    id: "Leaderboard memeringkat **area**, bukan orang. Satu area adalah satu region dipasangkan dengan satu segment, jadi “Sumatera · Masstige” adalah area yang berbeda dari “Sumatera · Halal PC”. Hanya area yang punya minimal satu initiative yang muncul.",
  },
  "leaderboard.p2": {
    en: "Each row adds up every point earned in that area, split across the two streams, with the total being the two combined. Areas with the same total share a rank. Archived initiatives and their points drop out of the count.",
    id: "Tiap baris menjumlahkan semua poin yang diperoleh di area itu, dipecah ke dua stream, dengan total berupa gabungan keduanya. Area dengan total sama berbagi peringkat yang sama. Initiative yang diarsipkan beserta poinnya keluar dari hitungan.",
  },
  "leaderboard.p3": {
    en: "The week filter uses the date the work happened, not the date it was typed in, so backdating an update puts the point in the week it belongs to. Weeks run **Monday to Sunday, Jakarta time**, for everyone, whichever time zone you are reading from.",
    id: "Filter minggu memakai tanggal pekerjaannya terjadi, bukan tanggal diketiknya, jadi update yang di-backdate akan masuk ke minggu yang semestinya. Minggu berjalan **Senin sampai Minggu, waktu Jakarta**, untuk semua orang, dari zona waktu mana pun Anda membacanya.",
  },
  "leaderboard.p4": {
    en: "If an initiative's region or segment is later corrected, points already earned stay with the area that earned them, and only new points go to the new area. Past weeks therefore do not change retrospectively.",
    id: "Kalau region atau segment sebuah initiative kemudian dikoreksi, poin yang sudah diperoleh tetap di area yang memperolehnya, dan hanya poin baru yang masuk ke area yang baru. Jadi minggu-minggu yang sudah lewat tidak berubah surut.",
  },

  "dashboard.p1": {
    en: "Every number on the dashboard counts **initiatives**, not points or updates, and every one of them excludes archived initiatives. Each is clickable and opens the list filtered to exactly the initiatives it counted, which is the quickest way to check one.",
    id: "Setiap angka di dashboard menghitung **initiative**, bukan poin atau update, dan semuanya tidak menyertakan initiative yang diarsipkan. Semua angkanya bisa diklik dan akan membuka daftar yang sudah difilter persis ke initiative yang dihitungnya — itu cara tercepat untuk mengeceknya.",
  },
  "dashboard.li.total": {
    en: "**Total initiatives** — every initiative in the library right now.",
    id: "**Total initiatives** — semua initiative yang ada di library saat ini.",
  },
  "dashboard.li.new": {
    en: "**New this week** — those created since Monday, Jakarta time. This one uses the date it was entered, not the date of the work.",
    id: "**New this week** — yang dibuat sejak Senin, waktu Jakarta. Yang ini memakai tanggal input, bukan tanggal pekerjaannya.",
  },
  "dashboard.li.existing": {
    en: "**Existing** — the total minus the new ones.",
    id: "**Existing** — total dikurangi yang baru.",
  },
  "dashboard.li.unlockings": {
    en: "**Open unlockings** — initiatives that have at least one update logged as an Unlocking.",
    id: "**Open unlockings** — initiative yang punya minimal satu update berkategori Unlocking.",
  },
  "dashboard.li.groupings": {
    en: "**By stage, pillar, region and segment** — the same set of initiatives grouped four different ways, so each of those four groupings adds up to the total.",
    id: "**By stage, pillar, region and segment** — kumpulan initiative yang sama dikelompokkan dengan empat cara berbeda, jadi masing-masing pengelompokan itu jumlahnya sama dengan totalnya.",
  },
  "dashboard.p2": {
    en: "**Top Initiatives** is the exception: it ranks by points rather than by count. It shows the initiatives that earned the most over the period you pick — one week, one calendar month, or all-time — and it opens on the current week.",
    id: "**Top Initiatives** adalah pengecualiannya: yang diperingkat poinnya, bukan jumlahnya. Bagian ini menampilkan initiative yang paling banyak mengumpulkan poin pada periode yang Anda pilih — satu minggu, satu bulan kalender, atau all-time — dan defaultnya terbuka di minggu berjalan.",
  },

  "everything.li.initiatives": {
    en: "**Initiatives** — the full library, searchable by title, description and update text, and filterable by region, segment, pillar, stage and how much follow-up is still open.",
    id: "**Initiatives** — library lengkapnya, bisa dicari lewat judul, deskripsi, dan isi update, serta bisa difilter berdasarkan region, segment, pillar, stage, dan seberapa banyak follow-up yang masih terbuka.",
  },
  "everything.li.detail": {
    en: "**Initiative detail** — the whole history of one topic: every update in date order, its points, its stage, its tags, its action items, and the other initiatives it connects to. Stage can be moved as the work progresses.",
    id: "**Initiative detail** — seluruh riwayat satu topik: setiap update urut tanggal, poinnya, stage-nya, tag-nya, action item-nya, dan initiative lain yang terhubung dengannya. Stage bisa digeser seiring pekerjaannya berjalan.",
  },
  "everything.li.actions": {
    en: "**Action items** — created from the follow-up field and assigned to the PIC. They move through Not Started, On Progress, Done and Withdrawn/Cancelled, and drive the follow-up filter on the list.",
    id: "**Action items** — dibuat dari field follow-up dan ditugaskan ke PIC. Statusnya bergerak lewat Not Started, On Progress, Done, dan Withdrawn/Cancelled, dan itulah yang menggerakkan filter follow-up di daftar.",
  },
  "everything.li.tags": {
    en: "**Tag and people pages** — open a tag or a PIC from any initiative to see everything else carrying it.",
    id: "**Halaman tag dan people** — buka sebuah tag atau seorang PIC dari initiative mana pun untuk melihat semua hal lain yang membawanya.",
  },
  "everything.li.archive": {
    en: "**Archive** — an admin can archive an initiative from its detail page. It disappears from lists, the dashboard, the leaderboard and duplicate matching, but nothing is destroyed and restoring puts it back exactly as it was.",
    id: "**Archive** — admin bisa mengarsipkan initiative dari halaman detailnya. Initiative itu hilang dari daftar, dashboard, leaderboard, dan pencocokan duplikat, tapi tidak ada yang dimusnahkan, dan memulihkannya akan mengembalikannya persis seperti semula.",
  },
  "everything.li.insights": {
    en: "**Insights** — which pages and initiatives are actually being used. Pseudonymous: it records that something was opened, never who opened it.",
    id: "**Insights** — halaman dan initiative mana yang benar-benar dipakai. Sifatnya pseudonim: yang dicatat adalah bahwa sesuatu dibuka, bukan siapa yang membukanya.",
  },
  "everything.li.graph": {
    en: "**Graph** ({access}) — a map of how initiatives connect through shared tags, shared people and explicit links.",
    id: "**Graph** ({access}) — peta bagaimana initiative saling terhubung lewat tag yang sama, orang yang sama, dan link yang dibuat manual.",
  },
  "everything.graph.access.yes": {
    en: "you have access",
    id: "Anda punya akses",
  },
  "everything.graph.access.no": {
    en: "super admin only",
    id: "khusus super admin",
  },
  "everything.li.admin": {
    en: "**Admin** (super admin only) — access list, the PIC directory, API keys for other systems, the viewer password, the template, archived initiatives, and the error and slow-request logs.",
    id: "**Admin** (khusus super admin) — daftar akses, direktori PIC, API key untuk sistem lain, password viewer, template, initiative yang diarsipkan, serta log error dan slow request.",
  },

  "changes.p1": {
    en: "This page describes the rules; it does not decide them. The approved requirements document is the source of truth, and every change to scoring or to one of the dropdown lists is recorded there as a numbered decision before it is built.",
    id: "Halaman ini menjelaskan aturannya; halaman ini tidak memutuskannya. Dokumen requirements yang sudah disetujui adalah sumber kebenarannya, dan setiap perubahan pada scoring atau pada salah satu daftar dropdown dicatat di sana sebagai keputusan bernomor sebelum dibangun.",
  },
  "changes.p2": {
    en: "So if a point value or a list here looks wrong, it is a question for the SPARK owner rather than something to work around. When a rule does change, the requirements document, the system, and this page are updated together in the same change — that is enforced by a test, so this page cannot quietly fall behind.",
    id: "Jadi kalau ada nilai poin atau daftar di sini yang kelihatan keliru, itu pertanyaan untuk pemilik SPARK, bukan sesuatu untuk diakali. Kalau suatu aturan memang berubah, dokumen requirements, sistemnya, dan halaman ini diperbarui bersamaan dalam satu perubahan — itu dijaga oleh test, jadi halaman ini tidak bisa diam-diam ketinggalan.",
  },

  "overview.prompt": {
    en: "Looking for the technical picture — stack, deployment, observability? See the",
    id: "Mencari gambaran teknisnya — stack, deployment, observability? Lihat",
  },
  "overview.link": { en: "System overview", id: "System overview" },
} satisfies Record<string, Entry>;

export type GuideKey = keyof typeof GUIDE_COPY;

/** Look up a key in `lang`, filling any {name} placeholders. */
export function t(
  key: GuideKey,
  lang: Lang,
  vars?: Record<string, string | number>,
): string {
  const text = GUIDE_COPY[key][lang];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}
