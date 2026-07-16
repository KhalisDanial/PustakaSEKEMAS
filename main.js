// ==========================================
// KONFIGURASI PANGKALAN DATA SUPABASE
// ==========================================
const supabaseUrl = 'https://cawrvnutflgvbrisuqtd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhd3J2bnV0ZmxndmJyaXN1cXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNDcwODgsImV4cCI6MjA4MTYyMzA4OH0.ZLSVVcZUl2muc584TL_UIYxykjrf_F_dOtDJp53A3cU';

// Initialize Supabase Client (DITUKAR KEPADA supabaseClient)
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false // Menghentikan cubaan menulis ke localStorage pihak ketiga
    }
});

// ==========================================
// GLOBAL STATE TRACKERS (Hanya satu set sahaja di sini!)
// ==========================================
let allStudents = []; // Will be populated dynamically from Supabase
let currentSchoolId = '16c21780-7831-4ed8-807d-af5c65f631bd'; 
let currentLibraryView = 'SIRKULASI';
let currentLibrarian = null;
let activeBorrower = null;

// ==========================================
// DYNAMIC STUDENT RETRIEVAL
// ==========================================
async function fetchStudents() {
    console.log("Fetching students list from Supabase...");
    try {
        const { data: students, error } = await supabaseClient
            .from('students') // Assuming your table name in Supabase is 'students'
            .select('*')
            .eq('school_id', currentSchoolId);

        if (error) throw error;

        allStudents = students || [];
        console.log(`Successfully cached ${allStudents.length} students locally.`);
    } catch (error) {
        console.error("Error loading students list:", error);
    }
}

// ==========================================
// FUNGSI NAVIGASI / INTERFAK
// ==========================================

function switchLibraryView(viewName) {
    currentLibraryView = viewName;
    
    // Sembunyikan semua pandangan, kemudian tunjukkan yang dipilih
    document.querySelectorAll('.library-view').forEach(view => view.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    if (viewName === 'SIRKULASI') {
        document.getElementById('view-sirkulasi').classList.remove('hidden');
        document.getElementById('btn-nav-sirkulasi').classList.add('active');
        if (typeof focusScannerInput === 'function') focusScannerInput();
    } 
    else if (viewName === 'KATALOG') {
        document.getElementById('view-katalog').classList.remove('hidden');
        document.getElementById('btn-nav-katalog').classList.add('active');
    } 
    else if (viewName === 'LOG') {
        document.getElementById('view-log').classList.remove('hidden');
        document.getElementById('btn-nav-log').classList.add('active');
        if (typeof fetchDailyLoans === 'function') fetchDailyLoans();
        fetchRegisteredBooks();
    }
    else if (viewName === 'HISTORY') {
        document.getElementById('view-history').classList.remove('hidden');
        document.getElementById('btn-nav-history').classList.add('active');
        fetchLoanHistory(); 
    }
    // 🌟 BARU: Sokongan Navigasi untuk Tab Inventori Buku
    else if (viewName === 'INVENTORI') {
        document.getElementById('view-inventori').classList.remove('hidden');
        document.getElementById('btn-nav-inventori').classList.add('active');
        fetchInventoryBooks(); // Panggil data dari pangkalan data
    }    
}

// Auto-focus helper to ensure the user doesn't have to keep clicking the screen
function focusScannerInput() {
    const input = document.getElementById('library-scan-input');
    if (input) {
        input.focus();
        // Force focus even if they click somewhere else accidentally
        input.onblur = () => setTimeout(() => input.focus(), 100);
    }
}

// // Event Listener for the Barcode Scanner input box & Initial Load
// document.addEventListener('DOMContentLoaded', async () => {
//     // 1. Fetch students from database immediately
//     await fetchStudents();

//     // 2. Focus scanner input
//     focusScannerInput();

//     const scanInput = document.getElementById('library-scan-input');
//     if (scanInput) {
//         scanInput.addEventListener('keydown', async (e) => {
//             if (e.key === 'Enter') {
//                 const barcodeValue = scanInput.value.trim();
//                 scanInput.value = ''; // Clean the input field instantly
                
//                 if (barcodeValue) {
//                     await handleIncomingBarcode(barcodeValue);
//                 }
//             }
//         });
//     }
// });

// The master routing engine for all scans
async function handleIncomingBarcode(barcode) {
    const feedback = document.getElementById('scan-feedback-message');
    
    // 1. Check if the scanned barcode belongs to a student (looks in local dashboard memory)
    const student = (typeof allStudents !== 'undefined') ? allStudents.find(s => s.barcode && s.barcode.toString() === barcode) : null;
    
    if (student) {
        // A student was scanned! Switch app to "Borrowing Mode" for this student
        activeBorrower = student;
        updateBorrowerUI(student);
        showFeedback("Murid dikesan! Sila imbas buku yang ingin dipinjam.", "success");
        return;
    }

    // 2. If it's not a student, it must be a book barcode. Query Supabase.
    showFeedback("Menyemak maklumat buku...", "info");
    
    const { data: book, error } = await supabaseClient
        .from('books')
        .select('*')
        .eq('school_id', currentSchoolId)
        .eq('book_barcode', barcode)
        .maybeSingle();

    if (error || !book) {
        showFeedback("Ralat: Buku tidak dijumpai dalam katalog sistem!", "danger");
        return;
    }

    // 3. Evaluate Action based on Borrower State & Book Status
    if (activeBorrower) {
        // We have an active student session -> Process as BORROW
        if (book.status === 'Borrowed') {
            showFeedback(`Buku "${book.title}" sedang dipinjam oleh orang lain! Sila pulangkan terlebih dahulu.`, "danger");
        } else {
            await processBookBorrow(activeBorrower, book);
        }
    } else {
        // No active student session -> Process as RETURN
        if (book.status === 'Available') {
            showFeedback(`Buku "${book.title}" sudah sedia ada di dalam perpustakaan.`, "info");
        } else {
            await processBookReturn(book);
        }
    }
}

// Function to update the Left Side Card showing who is currently scanning
function updateBorrowerUI(student) {
    const card = document.getElementById('card-active-borrower');
    if (!student) {
        card.className = "status-card empty";
        card.innerHTML = `<h4>Peminjam Aktif</h4><div class="card-body">Tiada murid diimbas. Sila imbas kad murid untuk mula meminjam.</div>`;
        return;
    }
    card.className = "status-card active-user";
    card.innerHTML = `
        <h4>Peminjam Aktif</h4>
        <div class="card-body">
            <p><strong>Nama:</strong> ${student.name}</p>
            <p><strong>Kelas:</strong> ${student.class_name_full || '-'}</p>
            <button class="btn-clear-session" onclick="clearBorrowerSession()">Selesai / Batal</button>
        </div>
    `;
}

function clearBorrowerSession() {
    activeBorrower = null;
    updateBorrowerUI(null);
    showFeedback("Sesi pinjaman tamat. Sedia untuk imbasan seterusnya.", "info");
}

function showFeedback(msg, type) {
    const feedback = document.getElementById('scan-feedback-message');
    if (feedback) {
        feedback.innerText = msg;
        feedback.className = `feedback-banner ${type}`;
    }
}

// ==========================================
// OPERASI PANGKALAN DATA (SUPABASE ACTIONS)
// ==========================================

// 1. PROSES PINJAMAN BUKU
async function processBookBorrow(student, book) {
    showFeedback(`Memproses pinjaman buku "${book.title}"...`, "info");

    // Langkah A: Masukkan rekod baru ke dalam jadual library_loans
    const { error: loanError } = await supabaseClient
        .from('library_loans')
        .insert([{
            school_id: currentSchoolId,
            student_id: student.id,
            book_id: book.id,
            status: 'Active' // Menandakan buku sedang aktif dipinjam
        }]);

    if (loanError) {
        showFeedback("Ralat: Gagal mencipta rekod pinjaman dalam pangkalan data.", "danger");
        console.error(loanError);
        return;
    }

    // Langkah B: Kemaskini status buku kepada 'Borrowed' dalam jadual books
    const { error: bookError } = await supabaseClient
        .from('books')
        .update({ status: 'Borrowed' })
        .eq('id', book.id);

    if (bookError) {
        showFeedback("Ralat: Gagal mengemaskini status buku kepada 'Borrowed'.", "danger");
        console.error(bookError);
        return;
    }

    // Sukses! Kemaskini UI Maklum Balas dan Kad Transaksi Terakhir
    showFeedback(`Berjaya! "${book.title}" telah dipinjam oleh ${student.name}.`, "success");
    updateLatestActionUI({
        type: 'PINJAM',
        studentName: student.name,
        studentClass: student.class_name_full || '-',
        bookTitle: book.title,
        timestamp: new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })
    });

    // Kekalkan sesi peminjam yang sama jika murid ingin meminjam lebih daripada satu buku
    // Cuma kosongkan field input scanner sedia ada untuk imbasan buku seterusnya
    focusScannerInput();
}

// 2. PROSES PEMULANGAN BUKU
async function processBookReturn(book) {
    showFeedback(`Mengimbas pemulangan buku "${book.title}"...`, "info");

    // Langkah A: Cari rekod pinjaman aktif bagi buku ini untuk mengetahui maklumat peminjam asal
    const { data: activeLoan, error: fetchError } = await supabaseClient
        .from('library_loans')
        .select('id, student_id, students(name, class_name_full)')
        .eq('book_id', book.id)
        .eq('status', 'Active')
        .maybeSingle();

    if (fetchError || !activeLoan) {
        showFeedback("Ralat: Rekod pinjaman aktif bagi buku ini tidak dijumpai!", "danger");
        return;
    }

    const studentInfo = activeLoan.students;

    // Langkah B: Kemaskini jadual library_loans (tanda tarikh pulang & tukar status)
    const { error: loanError } = await supabaseClient
        .from('library_loans')
        .update({ 
            status: 'Returned', 
            returned_at: new Date().toISOString() 
        })
        .eq('id', activeLoan.id);

    if (loanError) {
        showFeedback("Ralat: Gagal mengemaskini penutupan rekod pinjaman.", "danger");
        console.error(loanError);
        return;
    }

    // Langkah C: Kemaskini jadual books kembali kepada 'Available'
    const { error: bookError } = await supabaseClient
        .from('books')
        .update({ status: 'Available' })
        .eq('id', book.id);

    if (bookError) {
        showFeedback("Ralat: Gagal mengemaskini ketersediaan buku.", "danger");
        console.error(bookError);
        return;
    }

    // Sukses! Kemaskini UI Maklum Balas dan Kad Transaksi Terakhir
    showFeedback(`Berjaya dipulangkan! "${book.title}" telah diterima kembali.`, "success");
    updateLatestActionUI({
        type: 'PULANG',
        studentName: studentInfo ? studentInfo.name : 'Murid Umum',
        studentClass: studentInfo ? (studentInfo.class_name_full || '-') : '-',
        bookTitle: book.title,
        timestamp: new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })
    });

    focusScannerInput();
}

// 3. KEMASKINI KAD TRANSAKSI TERAKHIR (LATEST ACTION TILE)
function updateLatestActionUI(data) {
    const card = document.getElementById('card-latest-action');
    if (!card) return;

    if (data.type === 'PINJAM') {
        card.className = "status-card action-borrow"; 
        card.innerHTML = `
            <h4>🔄 Transaksi Terakhir</h4>
            <div class="card-body">
                <span class="badge badge-borrow">PINJAMAN AKTIF</span>
                <p style="margin-top: 8px;"><strong>Buku:</strong> ${data.bookTitle}</p>
                <p><strong>Peminjam:</strong> ${data.studentName} (${data.studentClass})</p>
                <small style="color: #666;">Masa: ${data.timestamp}</small>
            </div>
        `;
    } else {
        card.className = "status-card action-return"; 
        card.innerHTML = `
            <h4>🔄 Transaksi Terakhir</h4>
            <div class="card-body">
                <span class="badge badge-return">TELAH DIPULANGKAN</span>
                <p style="margin-top: 8px;"><strong>Buku:</strong> ${data.bookTitle}</p>
                <p><strong>Dipulangkan Oleh:</strong> ${data.studentName} (${data.studentClass})</p>
                <small style="color: #666;">Masa: ${data.timestamp}</small>
            </div>
        `;
    }
}

// ==========================================
// KATALOG BUKU VIEW MANAGEMENT
// ==========================================
let activeKatalogTab = 'ISBN';
let temporaryBookData = null; // Holds external API data before database insertion

// Switches between ISBN, CSV, and Manual input panels
function switchKatalogSubTab(tabName) {
    activeKatalogTab = tabName;
    
    // Hide all catalog content sub-panels
    document.querySelectorAll('.katalog-subview').forEach(view => view.classList.add('hidden'));
    document.querySelectorAll('.katalog-tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Reset temporary states
    temporaryBookData = null;
    const previewCard = document.getElementById('isbn-preview-card');
    if (previewCard) previewCard.classList.add('hidden');

    if (tabName === 'ISBN') {
        document.getElementById('subview-isbn').classList.remove('hidden');
        document.getElementById('tab-btn-isbn').classList.add('active');
        const isbnInput = document.getElementById('isbn-input');
        if (isbnInput) isbnInput.focus();
    } 
    else if (tabName === 'CSV') {
        document.getElementById('subview-csv').classList.remove('hidden');
        document.getElementById('tab-btn-csv').classList.add('active');
    } 
    else if (tabName === 'MANUAL') {
        document.getElementById('subview-manual').classList.remove('hidden');
        document.getElementById('tab-btn-manual').classList.add('active');
        const manualBarcode = document.getElementById('manual-barcode');
        if (manualBarcode) manualBarcode.focus();
    }
}

// // Hook into ISBN sub-view scanner input trigger
// document.addEventListener('DOMContentLoaded', () => {
//     const isbnInput = document.getElementById('isbn-input');
//     if (isbnInput) {
//         isbnInput.addEventListener('keydown', async (e) => {
//             if (e.key === 'Enter') {
//                 e.preventDefault();
//                 await lookupISBN();
//             }
//         });
//     }
// });


// document.addEventListener('DOMContentLoaded', () => {
//     // Cari element filter status yang kita bina tadi
//     const statusFilter = document.getElementById('book-status-filter');
//     if (statusFilter) {
//         statusFilter.addEventListener('change', () => {
//             fetchRegisteredBooks(); // Panggil fungsi refresh jadual bila status ditukar
//         });
//     }

//     // (Pilihan) Jika anda mahu filter hari sedia ada juga automatik refresh apabila ditukar:
//     const durationFilter = document.getElementById('loan-duration-filter');
//     if (durationFilter) {
//         durationFilter.addEventListener('change', () => {
//             fetchRegisteredBooks();
//         });
//     }
// });
// ==========================================
// INTEGRASI API ISBN & PENDAFTARAN MANUAL
// ==========================================

// 1. CARI MAKLUMAT BUKU VIA GOOGLE BOOKS & OPEN LIBRARY API
async function lookupISBN() {
    const isbnInput = document.getElementById('isbn-input');
    const loadingIndicator = document.getElementById('isbn-loading');
    const previewCard = document.getElementById('isbn-preview-card');
    
    // TAMPAL API KEY ANDA DI SINI
    const apiKey = "AIzaSyDV5yO9wUYPv7gSsVHOnYh_MlCzcj6KvlI"; 
    
    const isbn = isbnInput.value.trim();
    console.log("Memulakan carian untuk ISBN:", isbn); 

    if (!isbn) {
        alert("Sila imbas atau masukkan kod ISBN terlebih dahulu.");
        return;
    }

    // Paparkan status memuatkan & sembunyikan kad pratonton lama
    loadingIndicator.innerText = "Mencari di pangkalan data...";
    loadingIndicator.classList.remove('hidden');
    previewCard.classList.add('hidden');
    temporaryBookData = null;

    try {
        let title = "Tiada Tajuk";
        let authors = "Penulis Tidak Diketahui";
        let bookFound = false;

        // --- CUBAAN 1: GOOGLE BOOKS API ---
        console.log("Mencari maklumat di Google Books...");
        const googleResponse = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${apiKey}`);
        const googleData = await googleResponse.json();

        if (googleData.items && googleData.totalItems > 0) {
            const bookInfo = googleData.items[0].volumeInfo;
            title = bookInfo.title || "Tiada Tajuk";
            authors = bookInfo.authors ? bookInfo.authors.join(', ') : "Penulis Tidak Diketahui";
            bookFound = true;
            console.log("Buku berjaya dijumpai di Google Books!");
        } 
        else {
            // --- CUBAAN 2: OPEN LIBRARY API (FALLBACK) ---
            console.log("Tiada di Google Books. Beralih ke Open Library...");
            loadingIndicator.innerText = "Mencari di Open Library..."; // Update status UI
            
            const olResponse = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`);
            const olData = await olResponse.json();
            const olKey = `ISBN:${isbn}`;

            if (olData[olKey]) {
                const bookInfo = olData[olKey];
                title = bookInfo.title || "Tiada Tajuk";
                authors = bookInfo.authors ? bookInfo.authors.map(a => a.name).join(', ') : "Penulis Tidak Diketahui";
                bookFound = true;
                console.log("Buku berjaya dijumpai di Open Library!");
            }
        }

        // --- KEPUTUSAN GABUNGAN ---
        if (!bookFound) {
            alert("Buku tidak dijumpai di Google Books mahupun Open Library. Sila guna pendaftaran Manual.");
            loadingIndicator.classList.add('hidden');
            return;
        }

        // --- SEDIAKAN DATA UNTUK DISIMPAN ---
        temporaryBookData = {
            barcode: isbn,
            title: title,
            author: authors
        };

        // --- KEMASKINI ANTARAMUKA (UI) ---
        document.getElementById('prev-title').innerText = title;
        document.getElementById('prev-author').innerText = authors;
        document.getElementById('prev-isbn').innerText = isbn;

        previewCard.classList.remove('hidden');

    } catch (error) {
        console.error("Ralat penuh API ISBN:", error); 
        alert("Gagal menghubungi pelayan maklumat API. Semak konsol F12 untuk ralat.");
    } finally {
        loadingIndicator.classList.add('hidden');
    }
}

// 2. SAHKAN & SIMPAN DATA DARIPADA API KE SUPABASE
async function uploadISBNData() {
    // Pindahkan semakan ini ke atas supaya ralat tidak berlaku jika temporaryBookData kosong
    if (!temporaryBookData) return; 

    // Ambil nilai ISBN daripada elemen pratonton
    const isbnCode = document.getElementById('prev-isbn').textContent;

    // 1. SEKATAN: Semak duplikasi terus di Supabase untuk mendapatkan Tajuk & Tarikh
    const { data: existingBook, error: checkError } = await supabaseClient
        .from('books')
        .select('title, created_at')
        .eq('book_barcode', isbnCode)
        .eq('school_id', currentSchoolId) // Pastikan ia menyemak khusus untuk sekolah/institusi semasa
        .maybeSingle();

    if (checkError) {
        console.error("Ralat semakan duplikasi:", checkError);
        alert("Sistem ralat semasa menyemak status buku.");
        return;
    }

    // Jika buku sudah wujud, paparkan amaran terperinci
    if (existingBook) {
        // Tukar format tarikh (Contoh: 16 Julai 2026)
        const tarikhDaftar = new Date(existingBook.created_at).toLocaleDateString('ms-MY', {
            day: 'numeric', month: 'long', year: 'numeric'
        });

        alert(`❌ PENDAFTARAN DIBATALKAN!\n\nBuku dengan ISBN [${isbnCode}] telah didaftarkan dalam inventori.\n\nTajuk Buku: ${existingBook.title}\nTarikh Didaftar: ${tarikhDaftar}`);
        return; // Hentikan fungsi di sini, data tidak akan disimpan
    } 

    // 2. PROSES PENYIMPANAN: Masukkan maklumat ke dalam jadual 'books' di Supabase
    const { error } = await supabaseClient
        .from('books')
        .insert([{
            school_id: currentSchoolId,
            book_barcode: temporaryBookData.barcode,
            title: temporaryBookData.title,
            author: temporaryBookData.author,
            status: 'Available' 
        }]);

    if (error) {
        console.error(error);
        alert("Gagal menyimpan buku. Sila pastikan kod bar ini belum pernah didaftarkan.");
        return;
    }

    alert(`Berjaya mendaftarkan: "${temporaryBookData.title}"!`);
    
    // 3. RESET ANTARAMUKA PENGGUNA
    temporaryBookData = null;
    document.getElementById('isbn-preview-card').classList.add('hidden');
    
    const isbnInput = document.getElementById('isbn-input');
    isbnInput.value = '';
    isbnInput.focus(); 
}

// 3. PROSES PENDAFTARAN SECARA MANUAL (BUKU TANPA ISBN)
async function saveManualBook() {
    const barcodeInput = document.getElementById('manual-barcode');
    const titleInput = document.getElementById('manual-title');
    const authorInput = document.getElementById('manual-author');

    const barcode = barcodeInput.value.trim();
    const title = titleInput.value.trim();
    const author = authorInput.value.trim();

    // 1. Pengesahan input kosong
    if (!barcode || !title) {
        alert("Sila isi sekurang-kurangnya Kod Bar dan Tajuk Buku.");
        return;
    }

    // 2. SEKATAN: Semak duplikasi kod bar manual di Supabase
    const { data: existingBook, error: checkError } = await supabaseClient
        .from('books')
        .select('title, created_at')
        .eq('book_barcode', barcode)
        .eq('school_id', currentSchoolId)
        .maybeSingle();

    if (checkError) {
        console.error("Ralat semakan duplikasi manual:", checkError);
        alert("Sistem ralat semasa menyemak status kod bar.");
        return;
    }

    // Jika kod bar sudah digunakan, paparkan amaran terperinci
    if (existingBook) {
        const tarikhDaftar = new Date(existingBook.created_at).toLocaleDateString('ms-MY', {
            day: 'numeric', month: 'long', year: 'numeric'
        });

        alert(`❌ PENDAFTARAN DIBATALKAN!\n\nKod bar [${barcode}] telah digunakan dalam inventori.\n\nTajuk Buku: ${existingBook.title}\nTarikh Didaftar: ${tarikhDaftar}`);
        
        // Kosongkan semula input kod bar supaya mudah diimbas kod baru
        barcodeInput.value = '';
        barcodeInput.focus();
        return; 
    }

    // 3. PROSES PENYIMPANAN: Jika tiada duplikasi, teruskan simpan ke database
    const { error } = await supabaseClient
        .from('books')
        .insert([{
            school_id: currentSchoolId,
            book_barcode: barcode,
            title: title,
            author: author || 'Tiada Maklumat',
            status: 'Available'
        }]);

    if (error) {
        console.error(error);
        alert("Gagal mendaftar secara manual. Sila pastikan sistem dalam keadaan baik.");
        return;
    }

    alert(`Buku "${title}" berjaya didaftarkan secara manual!`);

    // 4. RESET ANTARAMUKA PENGGUNA
    barcodeInput.value = '';
    titleInput.value = '';
    authorInput.value = '';
    barcodeInput.focus();
}

// // ==========================================
// // PENGURUSAN MUAT NAIK PUKAL (CSV ENGINES)
// // ==========================================

// document.addEventListener('DOMContentLoaded', () => {
//     const dropzone = document.getElementById('csv-dropzone');
//     const fileInput = document.getElementById('csv-file-input');

//     if (!dropzone || !fileInput) return;

//     ['dragenter', 'dragover'].forEach(eventName => {
//         dropzone.addEventListener(eventName, (e) => {
//             e.preventDefault();
//             dropzone.style.background = '#edf2f7';
//             dropzone.style.borderColor = '#4a5568';
//         }, false);
//     });

//     ['dragleave', 'drop'].forEach(eventName => {
//         dropzone.addEventListener(eventName, (e) => {
//             e.preventDefault();
//             dropzone.style.background = '#f7fafc';
//             dropzone.style.borderColor = '#cbd5e0';
//         }, false);
//     });

//     dropzone.addEventListener('drop', (e) => {
//         const dt = e.dataTransfer;
//         const files = dt.files;
//         if (files.length) processCSVFile(files[0]);
//     });

//     fileInput.addEventListener('change', (e) => {
//         if (fileInput.files.length) processCSVFile(fileInput.files[0]);
//     });
// });

function processCSVFile(file) {
    if (file.type !== "text/csv" && !file.name.endsWith('.csv')) {
        alert("Ralat: Sila masukkan fail format .CSV sahaja.");
        return;
    }

    const reader = new FileReader();
    const progressIndicator = document.getElementById('csv-progress');
    
    progressIndicator.classList.remove('hidden');
    progressIndicator.innerText = "Membaca fail CSV...";

    reader.onload = async function (e) {
        const text = e.target.result;
        const rows = text.split('\n').map(row => row.replace('\r', '').trim()).filter(row => row.length > 0);
        
        if (rows.length <= 1) {
            alert("Fail CSV kosong atau tiada lajur data!");
            progressIndicator.classList.add('hidden');
            return;
        }

        const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
        const barcodeIdx = headers.indexOf('barcode');
        const titleIdx = headers.indexOf('title');
        const authorIdx = headers.indexOf('author');

        if (barcodeIdx === -1 || titleIdx === -1) {
            alert("Gagal memproses fail! Pastikan lajur baris pertama mengandungi tajuk: 'barcode' dan 'title'");
            progressIndicator.classList.add('hidden');
            return;
        }

        const booksBatch = [];

        for (let i = 1; i < rows.length; i++) {
            const columns = rows[i].split(',');
            if (columns.length < Math.max(barcodeIdx, titleIdx) + 1) continue; 

            const barcode = columns[barcodeIdx].trim();
            const title = columns[titleIdx].trim();
            const author = authorIdx !== -1 && columns[authorIdx] ? columns[authorIdx].trim() : 'Tiada Maklumat';

            if (barcode && title) {
                booksBatch.push({
                    school_id: currentSchoolId,
                    book_barcode: barcode,
                    title: title,
                    author: author,
                    status: 'Available'
                });
            }
        }

        if (booksBatch.length === 0) {
            alert("Tiada rekod data sah ditemui untuk dimuat naik.");
            progressIndicator.classList.add('hidden');
            return;
        }

        progressIndicator.innerText = `Menyimpan ${booksBatch.length} buah buku ke pangkalan data...`;
        await executeBulkInsert(booksBatch);
    };

    reader.readAsText(file);
}

async function executeBulkInsert(booksArray) {
    const progressIndicator = document.getElementById('csv-progress');

    const { error } = await supabaseClient
        .from('books')
        .insert(booksArray);

    progressIndicator.classList.add('hidden');

    if (error) {
        console.error(error);
        alert("Gagal memuat naik data secara pukal. Sila semak jika terdapat pertindihan Kod Bar dalam fail.");
        return;
    }

    alert(`Berjaya! ${booksArray.length} rekod buku telah didaftarkan ke dalam katalog sistem.`);
    document.getElementById('csv-file-input').value = '';
}

// ==========================================
// PAPARAN SENARAI BUKU (LOG & RINGKASAN)
// ==========================================

async function fetchRegisteredBooks() {
    const tableBody = document.getElementById('books-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:15px;">Memuatkan data buku terkini...</td></tr>`;

    const filterElement = document.getElementById('loan-duration-filter');
    const filterDays = filterElement ? filterElement.value : 'all';

    const statusFilterElement = document.getElementById('book-status-filter');
    const filterStatus = statusFilterElement ? statusFilterElement.value : 'all';

    // 🌟 BARU: Ambil nilai carian
    const searchInput = document.getElementById('log-search-input');
    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';

    try {
        const { data: books, error } = await supabaseClient
            .from('books')
            .select(`
                *,
                library_loans(
                    status,
                    borrowed_at,
                    students(name, class_name_full)
                )
            `)
            .eq('school_id', currentSchoolId)
            .eq('is_active', true) 
            .order('created_at', { ascending: false });

        if (error) throw error;

        let countTotal = books.length;
        let countAvailable = 0;
        let countBorrowed = 0;
        let countOverdue = 0;
        const LEWAT_THRESHOLD_DAYS = 7;

        const now = new Date();
        let filteredBooks = [];

        books.forEach(book => {
            let isOverdue = false;
            let daysElapsed = 0;

            if (book.status === 'Available') {
                countAvailable++;
            } else {
                countBorrowed++;
                const activeLoan = book.library_loans?.find(loan => loan.status === 'Active');
                
                if (activeLoan && activeLoan.borrowed_at) {
                    const borrowedDate = new Date(activeLoan.borrowed_at);
                    daysElapsed = (now - borrowedDate) / (1000 * 60 * 60 * 24);
                    
                    if (daysElapsed > LEWAT_THRESHOLD_DAYS) {
                        countOverdue++;
                        isOverdue = true;
                    }
                }
            }

            let matchesStatus = false;
            if (filterStatus === 'all') {
                matchesStatus = true;
            } else if (filterStatus === 'Available' && book.status === 'Available') {
                matchesStatus = true;
            } else if (filterStatus === 'Borrowed' && book.status === 'Borrowed') {
                matchesStatus = true;
            } else if (filterStatus === 'Overdue' && isOverdue) {
                matchesStatus = true;
            }

            let matchesDuration = false;
            if (filterDays === 'all') {
                matchesDuration = true;
            } else if (book.status === 'Borrowed' && daysElapsed > parseInt(filterDays)) {
                matchesDuration = true;
            }

            // 🌟 BARU: Logik Tapisan Teks Carian (Tajuk ATAU Penulis)
            let matchesSearch = true;
            if (searchQuery !== '') {
                const titleMatch = (book.title || '').toLowerCase().includes(searchQuery);
                const authorMatch = (book.author || '').toLowerCase().includes(searchQuery);
                matchesSearch = titleMatch || authorMatch;
            }

            // Mesti lulus SEMUA tapisan (Status + Tempoh + Carian)
            if (matchesStatus && matchesDuration && matchesSearch) {
                filteredBooks.push({ ...book, isOverdue, daysElapsed });
            }
        });

        if (document.getElementById('kpi-total')) document.getElementById('kpi-total').innerText = countTotal;
        if (document.getElementById('kpi-available')) document.getElementById('kpi-available').innerText = countAvailable;
        if (document.getElementById('kpi-borrowed')) document.getElementById('kpi-borrowed').innerText = countBorrowed;
        if (document.getElementById('kpi-overdue')) document.getElementById('kpi-overdue').innerText = countOverdue;

        if (filteredBooks.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:15px; color: #718096;">Tiada padanan data ditemui.</td></tr>`;
            return;
        }

        tableBody.innerHTML = '';

        filteredBooks.forEach(book => {
            const tr = document.createElement('tr');
            
            if (book.isOverdue) {
                tr.style.backgroundColor = '#fff5f5';
                tr.style.borderBottom = '1px solid #feb2b2';
            } else {
                tr.style.borderBottom = '1px solid #e2e8f0';
            }

            let statusBadge = book.status === 'Available' 
                ? `<span style="background-color: #c6f6d5; color: #22543d; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;">Ada</span>`
                : `<span style="background-color: #bee3f8; color: #2a4365; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;">Dipinjam</span>`;

            if (book.isOverdue) {
                statusBadge += ` <span style="background-color: #e53e3e; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold; margin-left: 5px;">Lewat</span>`;
            }

            let borrowerName = '-';
            let borrowerClass = '-';
            let dateDisplay = '-';

            if (book.library_loans && book.library_loans.length > 0) {
                const activeLoan = book.library_loans.find(loan => loan.status === 'Active');
                if (activeLoan) {
                    borrowerName = activeLoan.students?.name || '-';
                    borrowerClass = activeLoan.students?.class_name_full || '-';
                    if (activeLoan.borrowed_at) {
                        const d = new Date(activeLoan.borrowed_at);
                        dateDisplay = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    }
                }
            }

            tr.innerHTML = `
                <td style="padding: 12px; font-family: monospace; font-weight: bold;">${book.book_barcode || '-'}</td>
                <td style="padding: 12px; font-weight: 500; color: ${book.isOverdue ? '#c53030' : 'inherit'};">${book.title || 'Tiada Tajuk'}</td>
                <td style="padding: 12px; color: #4a5568;">${book.author || '-'}</td>
                <td style="padding: 12px;">${statusBadge}</td>
                <td style="padding: 12px; font-weight: 500;">${borrowerName}</td>
                <td style="padding: 12px;">${borrowerClass}</td>
                <td style="padding: 12px; color: #718096; font-size: 0.9rem;">${dateDisplay}</td>
            `;
            tableBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Ralat memuatkan data ringkasan:", error);
    }
}

// ==========================================
// PAPARAN SEJARAH LENGKAP SIRKULASI
// ==========================================
async function fetchLoanHistory() {
    const tableBody = document.getElementById('history-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:15px;">Memuatkan sejarah sirkulasi...</td></tr>`;

    try {
        // Tarik data terus dari jadual transaksi pinjaman (termasuk rekod lama)
        // 🌟 Ditambah 'is_active' ke dalam pilihan data books
        const { data: history, error } = await supabaseClient
            .from('library_loans')
            .select(`
                *,
                books(title, book_barcode, is_active), 
                students(name, class_name_full)
            `)
            .eq('school_id', currentSchoolId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!history || history.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:15px;">Tiada rekod sirkulasi ditemui.</td></tr>`;
            return;
        }

        tableBody.innerHTML = '';

        history.forEach(record => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #e2e8f0';

            // Format Tarikh Pinjam
            const bDate = new Date(record.borrowed_at);
            const borrowStr = `${String(bDate.getDate()).padStart(2, '0')}/${String(bDate.getMonth() + 1).padStart(2, '0')}/${bDate.getFullYear()} ${String(bDate.getHours()).padStart(2, '0')}:${String(bDate.getMinutes()).padStart(2, '0')}`;

            // Format Tarikh Pulang (Jika belum pulang, tunjuk 'Belum')
            let returnStr = '<span style="color: #e53e3e; font-weight: bold;">Masih Dipinjam</span>';
            if (record.returned_at) {
                const rDate = new Date(record.returned_at);
                returnStr = `${String(rDate.getDate()).padStart(2, '0')}/${String(rDate.getMonth() + 1).padStart(2, '0')}/${rDate.getFullYear()} ${String(rDate.getHours()).padStart(2, '0')}:${String(rDate.getMinutes()).padStart(2, '0')}`;
            }

            // Status Badge
            const statusBadge = record.status === 'Returned' 
                ? `<span style="background-color: #e2e8f0; color: #4a5568; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;">Selesai</span>`
                : `<span style="background-color: #bee3f8; color: #2a4365; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;">Aktif</span>`;

            // 🌟 LOGIK DINAMIK UNTUK DISPLAY NAMA BUKU YANG TELAH DIPADAM
            let bookTitleDisplay = '-';
            
            if (record.books) {
                if (record.books.is_active === false) {
                    // Kes 1: Buku telah dilupuskan (Soft Delete) - Kekalkan nama tetapi letak indikator & strike-through
                    bookTitleDisplay = `
                        <span style="text-decoration: line-through; color: #a0aec0;">${record.books.title}</span> 
                        <span style="background-color: #fed7d7; color: #9b2c2c; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; margin-left: 5px; display: inline-block;">
                            No longer Available
                        </span>
                    `;
                } else {
                    // Kes 2: Buku aktif biasa
                    bookTitleDisplay = record.books.title || 'Tiada Tajuk';
                }
            } else {
                // Kes 3: Buku telah dipadam terus dari database sebelum ini (Hard Delete fallback)
                bookTitleDisplay = `
                    <span style="color: #e53e3e; font-weight: bold;">[Buku Dilupuskan]</span> 
                    <span style="background-color: #e2e8f0; color: #4a5568; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; margin-left: 5px; display: inline-block;">
                        No longer Available
                    </span>
                `;
            }

            const studentName = record.students ? record.students.name : '-';
            const studentClass = record.students ? record.students.class_name_full : '-';

            tr.innerHTML = `
                <td style="padding: 12px; color: #4a5568; font-size: 0.9rem;">${borrowStr}</td>
                <td style="padding: 12px; color: #4a5568; font-size: 0.9rem;">${returnStr}</td>
                <td style="padding: 12px; font-weight: 500; color: #2d3748;">${bookTitleDisplay}</td> <!-- Menggunakan dynamic title display -->
                <td style="padding: 12px;">${studentName}</td>
                <td style="padding: 12px;">${studentClass}</td>
                <td style="padding: 12px;">${statusBadge}</td>
            `;
            tableBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Ralat memuatkan sejarah:", error);
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:15px; color: #e53e3e;">Ralat memuatkan pangkalan data.</td></tr>`;
    }
}

// ==========================================
// 1. FUNGSI PADAM BUKU (SOFT DELETE)
// ==========================================
async function deleteBook(bookId, bookTitle) {
    console.log("Attempting to retire book:", { id: bookId, title: bookTitle });
    
    const confirmDelete = confirm(`AMARAN KERAS!\nAdakah anda pasti mahu melupuskan buku "${bookTitle}" daripada inventori?\n\nBuku ini akan dipindahkan ke arkib pelupusan. Sejarah pinjaman lampau akan dipelihara.`);
    if (!confirmDelete) return;

    try {
        const { data, error } = await supabaseClient
            .from('books')
            .update({ 
                is_active: false,
                updated_at: new Date().toISOString() // Simpan timestamp waktu pelupusan dibuat
            })
            .eq('id', bookId)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            alert("Ralat: Tidak dapat mengemaskini status buku! Sila semak sambungan rangkaian atau RLS.");
            return;
        }

        alert(`"${bookTitle}" telah berjaya dialihkan dari sistem aktif.`);
        
        // 🌟 Auto-refresh kedua-dua panel table jika wujud
        if (typeof fetchInventoryBooks === "function") {
            fetchInventoryBooks();
        }
        if (typeof fetchRegisteredBooks === "function") {
            fetchRegisteredBooks();
        }
        
    } catch (error) {
        console.error("Ralat pelupusan:", error);
        alert(`System Error: ${error.message}`);
    }
}

// ==========================================
// 2. FUNGSI CETAK / EXPORT KE PDF
// ==========================================
function printReport() {
    // Ini akan memanggil fungsi 'Print' di browser. 
    // Pengguna boleh memilih "Save as PDF" di tetingkap Print (Destination).
    window.print();
}

// ==========================================
// 3. FUNGSI EKSPORT KE CSV
// ==========================================
function exportCSV() {
    const table = document.getElementById("log-table");
    let csvContent = "data:text/csv;charset=utf-8,";
    const rows = table.querySelectorAll("tr");

    rows.forEach(row => {
        let rowData = [];
        const cols = row.querySelectorAll("th, td");
        
        // Loop lajur, TETAPI kita tolak lajur terakhir (cols.length - 1) 
        // supaya butang "Tindakan / Padam" tidak dimasukkan ke dalam fail CSV.
        for(let i = 0; i < cols.length - 1; i++) {
            // Bersihkan teks (buang newline dan gantikan koma dengan jarak supaya CSV tak rosak)
            let text = cols[i].innerText.replace(/(\r\n|\n|\r)/gm, " ").replace(/,/g, " ");
            rowData.push(text);
        }
        csvContent += rowData.join(",") + "\r\n";
    });

    // Cipta format file yang boleh didownload
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    
    // Namakan fail menggunakan tarikh hari ini
    const dateToday = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `Laporan_Pinjaman_Buku_${dateToday}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================
// RENDERING TAB INVENTORI BUKU (BARU)
// ==========================================
async function fetchInventoryBooks() {
    const activeTableBody = document.getElementById('inventory-active-table-body');
    const inactiveTableBody = document.getElementById('inventory-inactive-table-body');
    
    if (!activeTableBody || !inactiveTableBody) return;

    activeTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:15px;">Memuatkan senarai buku aktif...</td></tr>`;
    inactiveTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:15px;">Memuatkan rekod buku dilupuskan...</td></tr>`;

    // 🌟 BARU: Ambil nilai teks carian dari kotak carian Inventori
    const searchInput = document.getElementById('inventori-search-input');
    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';

    try {
        // Ambil semua buku sekolah ini (aktif & tidak aktif)
        const { data: books, error } = await supabaseClient
            .from('books')
            .select('*')
            .eq('school_id', currentSchoolId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        activeTableBody.innerHTML = '';
        inactiveTableBody.innerHTML = '';

        // 🌟 BARU: Tapis keseluruhan dataset buku terlebih dahulu berdasarkan carian
        let displayedBooks = books;
        if (searchQuery !== '') {
            displayedBooks = books.filter(book => {
                const titleMatch = (book.title || '').toLowerCase().includes(searchQuery);
                const authorMatch = (book.author || '').toLowerCase().includes(searchQuery);
                return titleMatch || authorMatch; // Lulus jika tajuk ATAU penulis sepadan
            });
        }

        // Pecahkan mengikut status keaktifan MENGGUNAKAN data yang telah ditapis (displayedBooks)
        const activeBooks = displayedBooks.filter(b => b.is_active !== false);
        const inactiveBooks = displayedBooks.filter(b => b.is_active === false);

        // ----------------------------------------
        // 1. PAPARAN JADUAL BUKU AKTIF
        // ----------------------------------------
        if (activeBooks.length === 0) {
            activeTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:15px; color: #718096;">Tiada padanan buku aktif ditemui.</td></tr>`;
        } else {
            activeBooks.forEach(book => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #e2e8f0';

                // Format Tarikh Daftar
                const d = new Date(book.created_at);
                const regDateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

                // Kira Tempoh Simpanan (How long the book has been there)
                const now = new Date();
                const diffTime = Math.abs(now - d);
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                let ageDisplay = "Hari ini";
                if (diffDays > 0) {
                    ageDisplay = `${diffDays} hari`;
                }

                let statusBadge = book.status === 'Available' 
                    ? `<span style="background-color: #c6f6d5; color: #22543d; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;">Ada</span>`
                    : `<span style="background-color: #bee3f8; color: #2a4365; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;">Dipinjam</span>`;

                tr.innerHTML = `
                    <td style="padding: 12px; font-family: monospace; font-weight: bold;">${book.book_barcode || '-'}</td>
                    <td style="padding: 12px; font-weight: 500; color: #2d3748;">${book.title || 'Tiada Tajuk'}</td>
                    <td style="padding: 12px; color: #4a5568;">${book.author || '-'}</td>
                    <td style="padding: 12px;">${statusBadge}</td>
                    <td style="padding: 12px; color: #718096; font-size: 0.9rem;">${regDateStr}</td>
                    <td style="padding: 12px; color: #2b6cb0; font-weight: 600; font-size: 0.9rem;">${ageDisplay}</td>
                    
                    <!-- Butang Padam diposisikan di sini sekarang -->
                    <td style="padding: 12px; text-align: center;">
                        <button class="btn-delete-book" style="background: #e53e3e; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-weight: bold;">Padam</button>
                    </td>
                `;

                // Hubungkan klik padam secara selamat
                const deleteBtn = tr.querySelector('.btn-delete-book');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', () => {
                        deleteBook(book.id, book.title);
                    });
                }

                activeTableBody.appendChild(tr);
            });
        }

        // ----------------------------------------
        // 2. PAPARAN JADUAL BUKU TIDAK AKTIF (DILUPUSKAN)
        // ----------------------------------------
        if (inactiveBooks.length === 0) {
            inactiveTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:15px; color: #cbd5e0;">Tiada padanan rekod pelupusan buku.</td></tr>`;
        } else {
            inactiveBooks.forEach(book => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #edf2f7';
                tr.style.backgroundColor = '#fcfcfc';

                // Format Tarikh Asal
                const dReg = new Date(book.created_at);
                const regDateStr = `${String(dReg.getDate()).padStart(2, '0')}/${String(dReg.getMonth() + 1).padStart(2, '0')}/${dReg.getFullYear()}`;

                // Format Tarikh Dilupuskan (menggunakan updated_at yang dikemaskini semasa padam)
                let removalDateStr = '-';
                if (book.updated_at) {
                    const dDel = new Date(book.updated_at);
                    removalDateStr = `${String(dDel.getDate()).padStart(2, '0')}/${String(dDel.getMonth() + 1).padStart(2, '0')}/${dDel.getFullYear()} ${String(dDel.getHours()).padStart(2, '0')}:${String(dDel.getMinutes()).padStart(2, '0')}`;
                }

                tr.innerHTML = `
                    <td style="padding: 12px; font-family: monospace; color: #a0aec0;">${book.book_barcode || '-'}</td>
                    <td style="padding: 12px; text-decoration: line-through; color: #a0aec0; font-weight: 500;">${book.title || 'Tiada Tajuk'}</td>
                    <td style="padding: 12px; color: #cbd5e0;">${book.author || '-'}</td>
                    <td style="padding: 12px; color: #a0aec0; font-size: 0.9rem;">${regDateStr}</td>
                    <td style="padding: 12px; color: #e53e3e; font-size: 0.9rem; font-weight: bold;">${removalDateStr}</td>
                    <td style="padding: 12px;">
                        <span style="background-color: #fed7d7; color: #9b2c2c; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;">Dilupuskan</span>
                    </td>
                `;
                inactiveTableBody.appendChild(tr);
            });
        }

    } catch (error) {
        console.error("Ralat membina senarai inventori:", error);
        activeTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:15px; color: #e53e3e;">Ralat memproses data dari pangkalan data.</td></tr>`;
    }
}

// ==========================================
// PUSAT KAWALAN UTAMA (INITIALIZATION)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    
    // ------------------------------------------
    // 1. Muatan Awal & Pengimbas Sirkulasi
    // ------------------------------------------
    await fetchStudents();
    if (typeof focusScannerInput === 'function') focusScannerInput();

    const scanInput = document.getElementById('library-scan-input');
    if (scanInput) {
        scanInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const barcodeValue = scanInput.value.trim();
                scanInput.value = ''; // Bersihkan input serta-merta
                
                if (barcodeValue) {
                    await handleIncomingBarcode(barcodeValue);
                }
            }
        });
    }

    // ------------------------------------------
    // 2. Pengimbas Katalog / ISBN
    // ------------------------------------------
    const isbnInput = document.getElementById('isbn-input');
    if (isbnInput) {
        isbnInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                await lookupISBN();
            }
        });
    }

    // ------------------------------------------
    // 3. Penapis & Carian: Log & Ringkasan
    // ------------------------------------------
    const statusFilter = document.getElementById('book-status-filter');
    if (statusFilter) {
        statusFilter.addEventListener('change', () => fetchRegisteredBooks());
    }

    const durationFilter = document.getElementById('loan-duration-filter');
    if (durationFilter) {
        durationFilter.addEventListener('change', () => fetchRegisteredBooks());
    }

    const logSearch = document.getElementById('log-search-input');
    if (logSearch) {
        logSearch.addEventListener('input', () => fetchRegisteredBooks());
    }

    // ------------------------------------------
    // 4. Carian: Inventori Buku
    // ------------------------------------------
    const inventoriSearch = document.getElementById('inventori-search-input');
    if (inventoriSearch) {
        inventoriSearch.addEventListener('input', () => fetchInventoryBooks());
    }

    // ------------------------------------------
    // 5. Pengurusan Muat Naik Pukal (CSV Engines)
    // ------------------------------------------
    const dropzone = document.getElementById('csv-dropzone');
    const fileInput = document.getElementById('csv-file-input');

    if (dropzone && fileInput) {
        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropzone.style.background = '#edf2f7';
                dropzone.style.borderColor = '#4a5568';
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropzone.style.background = '#f7fafc';
                dropzone.style.borderColor = '#cbd5e0';
            }, false);
        });

        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length) processCSVFile(files[0]);
        });

        fileInput.addEventListener('change', (e) => {
            if (fileInput.files.length) processCSVFile(fileInput.files[0]);
        });
    }
});

// 1. Fungsi Kiosk Mode (Lockdown)
function toggleKioskMode(isLocked) {
    const sidebar = document.querySelector('.library-sidebar');
    const scanInput = document.getElementById('library-scan-input');
    
    if (isLocked) {
        // Sembunyikan navigasi supaya pelajar tidak boleh tukar tab
        sidebar.style.display = 'none';
        // Fokuskan kotak imbasan
        scanInput.focus();
    } else {
        sidebar.style.display = 'flex';
    }
}

// 2. Cegah Fokus Hilang (PENTING)
// Jika pelajar tersentuh skrin, sistem akan auto-fokus balik ke scanner
const scannerInput = document.getElementById('library-scan-input');

// 2. Cegah Fokus Hilang (PENTING & HANYA AKTIF JIKA KUNCI)
document.addEventListener('click', (e) => {
    const sidebar = document.querySelector('.library-sidebar');
    
    // Hanya kunci fokus jika sidebar disembunyikan (Mod Kiosk)
    // Jika sidebar ada (Admin Mode), biarkan pengguna klik butang lain
    if (sidebar.style.display === 'none') {
        if (document.activeElement !== scannerInput) {
            scannerInput.focus();
        }
    }
});

// Pastikan input sentiasa fokus walaupun selepas imbasan berjaya
scannerInput.addEventListener('blur', () => {
    setTimeout(() => {
        scannerInput.focus();
    }, 100);
});

// Mekanisme Secret Tap pada Logo Trigger
let tapCount = 0;
let tapTimer = null;
const triggerBtn = document.getElementById('kiosk-trigger');

// TAMBAHAN: Semak jika butang wujud sebelum tambah event listener
if (triggerBtn) {
    triggerBtn.addEventListener('click', () => {
        tapCount++;
        
        // Reset timer jika tidak ditekan 5 kali dalam 2 saat
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => { tapCount = 0; }, 2000);

        if (tapCount === 5) {
            const sidebar = document.querySelector('.library-sidebar');
            // Jika sidebar tiada (display none), kita buka. Jika ada, kita kunci.
            const isCurrentlyLocked = (sidebar.style.display === 'none');
            
            toggleKioskMode(isCurrentlyLocked ? false : true);
            
            tapCount = 0; // Reset
            alert(isCurrentlyLocked ? "Sistem Dibuka (Admin Mode)" : "Sistem Dikunci (Kiosk Mode)");
        }
    });
} else {
    console.warn("Butang #kiosk-trigger tidak dijumpai dalam HTML.");
}

// Fungsi untuk memeriksa sama ada buku sudah wujud dalam database
async function isBookAlreadyRegistered(barcode) {
    try {
        const { data, error } = await supabase
            .from('books') // *** TUKAR 'books' jika nama tabel Supabase anda berbeza
            .select('barcode') // *** TUKAR 'barcode' mengikut nama kolum kod bar anda
            .eq('barcode', barcode)
            .maybeSingle(); // Mengambil satu data sahaja jika ada, tanpa mencetuskan ralat jika kosong

        if (error) {
            console.error("Ralat semasa menyemak pangkalan data:", error);
            return false;
        }

        // Jika data wujud (not null), bermakna buku sudah ada
        return data !== null; 
    } catch (err) {
        console.error(err);
        return false;
    }
}