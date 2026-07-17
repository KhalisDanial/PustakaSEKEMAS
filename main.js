// ==========================================
// KONFIGURASI PANGKALAN DATA SUPABASE
// ==========================================
const supabaseUrl = 'https://cawrvnutflgvbrisuqtd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhd3J2bnV0ZmxndmJyaXN1cXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNDcwODgsImV4cCI6MjA4MTYyMzA4OH0.ZLSVVcZUl2muc584TL_UIYxykjrf_F_dOtDJp53A3cU';

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: true }
});

// ==========================================
// GLOBAL STATE TRACKERS
// ==========================================
let allStudents = []; 
let currentSchoolId = '16c21780-7831-4ed8-807d-af5c65f631bd'; 
let currentLibraryView = 'SIRKULASI';
let currentLibrarian = null;
let activeBorrower = null;

// ==========================================
// KAWALAN AUTENTIKASI (LOGIN & LOGOUT)
// ==========================================
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error-msg');
    const submitBtn = document.getElementById('btn-login-submit');

    errorDiv.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.innerText = "Mengesahkan...";

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        if (data.user) {
            showApp(data.user);
        }
    } catch (error) {
        console.error("Ralat Log Masuk:", error.message);
        errorDiv.innerText = "Log masuk gagal! Sila pastikan e-mel dan kata laluan adalah betul.";
        errorDiv.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Log Masuk";
    }
}

// ==========================================
// KAWALAN AUTENTIKASI (LOGIN & LOGOUT) - DIKEMASKINI
// ==========================================
async function showApp(user) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    
    // Nilai lalai (fallback) jika profil tiada di dalam pangkalan data
    let displayName = user.email;
    let displayRole = "Pustakawan";

    try {
        // Ambil data profil secara dinamik daripada jadual 'profiles' yang dikongsi
        const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('full_name, role')
            .eq('id', user.id)
            .maybeSingle();

        if (error) throw error;

        if (profile) {
            displayName = profile.full_name;
            displayRole = profile.role || "Pustakawan SEKEMAS";
        }
    } catch (err) {
        console.warn("Gagal memuatkan profil pengguna, menggunakan e-mel sebagai ganti:", err.message);
    }

    // Kemaskini lencana pengenalan sidebar dengan rekabentuk yang lebih profesional
    const userBadge = document.querySelector('.user-badge');
    if (userBadge) {
        userBadge.innerHTML = `
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Pustakawan Bertugas:</div>
            <strong style="color: var(--primary-color); font-size: 0.95rem; display: block; margin: 3px 0; line-height: 1.3;">${displayName}</strong>
            <span style="background: #e2e8f0; color: #4a5568; font-size: 0.7rem; font-weight: bold; padding: 2px 6px; border-radius: 4px; display: inline-block;">${displayRole}</span>
        `;
    }
    
    // Mulakan proses memuatkan data sistem
    fetchStudents();
    switchLibraryView('SIRKULASI');
}

function showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
    
    // Bersihkan ruangan input login
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
}

async function handleLogout() {
    if (confirm("Adakah anda pasti untuk log keluar daripada sistem?")) {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            alert("Ralat semasa log keluar.");
            return;
        }
        showLogin();
    }
}

// ==========================================
// DYNAMIC STUDENT RETRIEVAL
// ==========================================
async function fetchStudents() {
    console.log("Fetching students list from Supabase...");
    try {
        const { data: students, error } = await supabaseClient
            .from('students') 
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
        fetchRegisteredBooks();
    }
    else if (viewName === 'HISTORY') {
        document.getElementById('view-history').classList.remove('hidden');
        document.getElementById('btn-nav-history').classList.add('active');
        fetchLoanHistory(); 
    }
    else if (viewName === 'INVENTORI') {
        document.getElementById('view-inventori').classList.remove('hidden');
        document.getElementById('btn-nav-inventori').classList.add('active');
        fetchInventoryBooks(); 
    }    
}

function focusScannerInput() {
    const input = document.getElementById('library-scan-input');
    if (input) {
        input.focus();
        input.onblur = () => setTimeout(() => input.focus(), 100);
    }
}

// ==========================================
// SIRKULASI: PENGURUSAN BARCODE KIOSK
// ==========================================
async function handleIncomingBarcode(barcode) {
    const feedback = document.getElementById('scan-feedback-message');
    
    const student = (typeof allStudents !== 'undefined') ? allStudents.find(s => s.barcode && s.barcode.toString() === barcode) : null;
    
    if (student) {
        activeBorrower = student;
        updateBorrowerUI(student);
        showFeedback("Murid dikesan! Sila imbas kod bar sistem (sekolah) pada buku.", "success");
        return;
    }

    showFeedback("Menyemak maklumat buku...", "info");
    
    const { data: book, error } = await supabaseClient
        .from('books')
        .select('*')
        .eq('school_id', currentSchoolId)
        .eq('book_barcode', barcode)
        .maybeSingle();

    if (error || !book) {
        showFeedback("Ralat: Buku tidak dijumpai! Pastikan anda mengimbas Kod Bar Sistem, bukan kod ISBN pengilang.", "danger");
        return;
    }

    if (activeBorrower) {
        if (book.status === 'Borrowed') {
            showFeedback(`Buku "${book.title}" sedang dipinjam oleh orang lain! Sila pulangkan terlebih dahulu.`, "danger");
        } else {
            await processBookBorrow(activeBorrower, book);
        }
    } else {
        if (book.status === 'Available') {
            showFeedback(`Buku "${book.title}" sudah sedia ada di dalam perpustakaan.`, "info");
        } else {
            await processBookReturn(book);
        }
    }
}

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

async function processBookBorrow(student, book) {
    showFeedback(`Memproses pinjaman buku "${book.title}"...`, "info");

    const { error: loanError } = await supabaseClient
        .from('library_loans')
        .insert([{
            school_id: currentSchoolId,
            student_id: student.id,
            book_id: book.id,
            status: 'Active' 
        }]);

    if (loanError) {
        showFeedback("Ralat: Gagal mencipta rekod pinjaman dalam pangkalan data.", "danger");
        return;
    }

    const { error: bookError } = await supabaseClient
        .from('books')
        .update({ status: 'Borrowed' })
        .eq('id', book.id);

    if (bookError) return;

    showFeedback(`Berjaya! "${book.title}" telah dipinjam oleh ${student.name}.`, "success");
    updateLatestActionUI({
        type: 'PINJAM',
        studentName: student.name,
        studentClass: student.class_name_full || '-',
        bookTitle: book.title,
        timestamp: new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })
    });
    focusScannerInput();
}

async function processBookReturn(book) {
    showFeedback(`Mengimbas pemulangan buku "${book.title}"...`, "info");

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

    const { error: loanError } = await supabaseClient
        .from('library_loans')
        .update({ status: 'Returned', returned_at: new Date().toISOString() })
        .eq('id', activeLoan.id);

    if (loanError) return;

    await supabaseClient.from('books').update({ status: 'Available' }).eq('id', book.id);

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
let temporaryBookData = null; 

function switchKatalogSubTab(tabName) {
    activeKatalogTab = tabName;
    
    document.querySelectorAll('.katalog-subview').forEach(view => view.classList.add('hidden'));
    document.querySelectorAll('.katalog-tab-btn').forEach(btn => btn.classList.remove('active'));
    
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

// ==========================================
// INTEGRASI API ISBN & PENDAFTARAN MANUAL
// ==========================================

async function lookupISBN() {
    const isbnInput = document.getElementById('isbn-input');
    const loadingIndicator = document.getElementById('isbn-loading');
    const previewCard = document.getElementById('isbn-preview-card');
    
    const apiKey = "AIzaSyDV5yO9wUYPv7gSsVHOnYh_MlCzcj6KvlI"; 
    const isbn = isbnInput.value.trim();

    if (!isbn) {
        alert("Sila imbas atau masukkan kod ISBN terlebih dahulu.");
        return;
    }

    loadingIndicator.innerText = "Mencari di pangkalan data...";
    loadingIndicator.classList.remove('hidden');
    previewCard.classList.add('hidden');
    temporaryBookData = null;

    try {
        let title = "Tiada Tajuk";
        let authors = "Penulis Tidak Diketahui";
        let publisher = "Tiada Maklumat";
        let year = "-";
        let bookFound = false;

        const googleResponse = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${apiKey}`);
        const googleData = await googleResponse.json();

        if (googleData.items && googleData.totalItems > 0) {
            const bookInfo = googleData.items[0].volumeInfo;
            title = bookInfo.title || "Tiada Tajuk";
            authors = bookInfo.authors ? bookInfo.authors.join(', ') : "Penulis Tidak Diketahui";
            publisher = bookInfo.publisher || "Tiada Maklumat";
            year = bookInfo.publishedDate ? bookInfo.publishedDate.substring(0, 4) : "-";
            bookFound = true;
        } 
        else {
            loadingIndicator.innerText = "Mencari di Open Library..."; 
            const olResponse = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`);
            const olData = await olResponse.json();
            const olKey = `ISBN:${isbn}`;

            if (olData[olKey]) {
                const bookInfo = olData[olKey];
                title = bookInfo.title || "Tiada Tajuk";
                authors = bookInfo.authors ? bookInfo.authors.map(a => a.name).join(', ') : "Penulis Tidak Diketahui";
                publisher = bookInfo.publishers ? bookInfo.publishers.map(p => p.name).join(', ') : "Tiada Maklumat";
                year = bookInfo.publish_date || "-";
                bookFound = true;
            }
        }

        if (!bookFound) {
            alert("Buku tidak dijumpai di Google Books mahupun Open Library. Sila guna pendaftaran Manual.");
            loadingIndicator.classList.add('hidden');
            return;
        }

        temporaryBookData = { isbn, title, author: authors, publisher, year };

        document.getElementById('prev-title').innerText = title;
        document.getElementById('prev-author').innerText = authors;
        document.getElementById('prev-isbn').innerText = isbn;
        document.getElementById('prev-publisher').innerText = publisher;
        document.getElementById('prev-year').innerText = year;
        
        // Clear unik barcode input field so it's ready for scan
        document.getElementById('isbn-unique-barcode').value = '';

        previewCard.classList.remove('hidden');
    } catch (error) {
        console.error("Ralat penuh API ISBN:", error); 
        alert("Gagal menghubungi pelayan maklumat API. Semak konsol F12 untuk ralat.");
    } finally {
        loadingIndicator.classList.add('hidden');
    }
}

async function uploadISBNData() {
    if (!temporaryBookData) return; 

    // Minta input Kod Bar Unik dari field yang baru ditambah
    const systemBarcode = document.getElementById('isbn-unique-barcode').value.trim();
    if (!systemBarcode) {
        alert("Pendaftaran Gagal: Sila masukkan Kod Bar Unik Sekolah untuk buku ini!");
        return;
    }

    // Semak duplikasi kod bar unik sistem
    const { data: existingBook, error: checkError } = await supabaseClient
        .from('books')
        .select('title, created_at')
        .eq('book_barcode', systemBarcode)
        .eq('school_id', currentSchoolId) 
        .maybeSingle();

    if (checkError) {
        alert("Sistem ralat semasa menyemak status kod bar.");
        return;
    }

    if (existingBook) {
        alert(`❌ PENDAFTARAN DIBATALKAN!\nKod bar sistem [${systemBarcode}] telah didaftarkan untuk buku: ${existingBook.title}`);
        return; 
    } 

    const { error } = await supabaseClient
        .from('books')
        .insert([{
            school_id: currentSchoolId,
            book_barcode: systemBarcode,       // Kod pelekat sekolah
            isbn: temporaryBookData.isbn,      // Kod kilang
            title: temporaryBookData.title,
            author: temporaryBookData.author,
            publisher: temporaryBookData.publisher,
            year_published: temporaryBookData.year,
            status: 'Available' 
        }]);

    if (error) {
        alert("Gagal menyimpan buku. Sila hubungi admin.");
        return;
    }

    alert(`Berjaya mendaftarkan: "${temporaryBookData.title}" dengan kod sistem ${systemBarcode}!`);
    
    temporaryBookData = null;
    document.getElementById('isbn-preview-card').classList.add('hidden');
    document.getElementById('isbn-input').value = '';
    document.getElementById('isbn-input').focus(); 
}

async function saveManualBook() {
    const barcodeInput = document.getElementById('manual-barcode');
    const isbnInput = document.getElementById('manual-isbn');
    const titleInput = document.getElementById('manual-title');
    const authorInput = document.getElementById('manual-author');
    const publisherInput = document.getElementById('manual-publisher');
    const yearInput = document.getElementById('manual-year');

    const barcode = barcodeInput.value.trim();
    const isbn = isbnInput.value.trim();
    const title = titleInput.value.trim();
    const author = authorInput.value.trim();
    const publisher = publisherInput.value.trim();
    const year = yearInput.value.trim();

    if (!barcode || !title) {
        alert("Sila isi sekurang-kurangnya Kod Bar Unik dan Tajuk Buku.");
        return;
    }

    const { data: existingBook, error: checkError } = await supabaseClient
        .from('books')
        .select('title, created_at')
        .eq('book_barcode', barcode)
        .eq('school_id', currentSchoolId)
        .maybeSingle();

    if (checkError) return;

    if (existingBook) {
        alert(`❌ PENDAFTARAN DIBATALKAN!\nKod bar [${barcode}] telah digunakan untuk buku: ${existingBook.title}`);
        barcodeInput.value = '';
        barcodeInput.focus();
        return; 
    }

    const { error } = await supabaseClient
        .from('books')
        .insert([{
            school_id: currentSchoolId,
            book_barcode: barcode,
            isbn: isbn || null,
            title: title,
            author: author || 'Tiada Maklumat',
            publisher: publisher || null,
            year_published: year || null,
            status: 'Available'
        }]);

    if (error) {
        alert("Gagal mendaftar secara manual.");
        return;
    }

    alert(`Buku "${title}" berjaya didaftarkan secara manual!`);

    barcodeInput.value = '';
    isbnInput.value = '';
    titleInput.value = '';
    authorInput.value = '';
    publisherInput.value = '';
    yearInput.value = '';
    barcodeInput.focus();
}

// ==========================================
// PENGURUSAN MUAT NAIK PUKAL (CSV ENGINES)
// ==========================================
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
        const isbnIdx = headers.indexOf('isbn');
        const pubIdx = headers.indexOf('publisher');
        const yearIdx = headers.indexOf('year');

        if (barcodeIdx === -1 || titleIdx === -1) {
            alert("Gagal! Fail mesti ada lajur: 'barcode' dan 'title'");
            progressIndicator.classList.add('hidden');
            return;
        }

        const booksBatch = [];

        for (let i = 1; i < rows.length; i++) {
            // Pemisahan fail CSV asas (tidak menyokong koma dalam petikan)
            const columns = rows[i].split(','); 
            if (columns.length < Math.max(barcodeIdx, titleIdx) + 1) continue; 

            const barcode = columns[barcodeIdx].trim();
            const title = columns[titleIdx].trim();
            
            if (barcode && title) {
                booksBatch.push({
                    school_id: currentSchoolId,
                    book_barcode: barcode,
                    title: title,
                    author: authorIdx !== -1 && columns[authorIdx] ? columns[authorIdx].trim() : 'Tiada Maklumat',
                    isbn: isbnIdx !== -1 && columns[isbnIdx] ? columns[isbnIdx].trim() : null,
                    publisher: pubIdx !== -1 && columns[pubIdx] ? columns[pubIdx].trim() : null,
                    year_published: yearIdx !== -1 && columns[yearIdx] ? columns[yearIdx].trim() : null,
                    status: 'Available'
                });
            }
        }

        if (booksBatch.length === 0) {
            alert("Tiada rekod data sah ditemui.");
            progressIndicator.classList.add('hidden');
            return;
        }

        progressIndicator.innerText = `Menyimpan ${booksBatch.length} buah buku...`;
        await executeBulkInsert(booksBatch);
    };
    reader.readAsText(file);
}

async function executeBulkInsert(booksArray) {
    const progressIndicator = document.getElementById('csv-progress');
    const { error } = await supabaseClient.from('books').insert(booksArray);
    progressIndicator.classList.add('hidden');

    if (error) {
        alert("Gagal muat naik pukal. Semak pertindihan kod bar sistem.");
        return;
    }

    alert(`Berjaya! ${booksArray.length} rekod buku didaftarkan.`);
    document.getElementById('csv-file-input').value = '';
}

// ==========================================
// PAPARAN SENARAI BUKU (LOG & RINGKASAN)
// ==========================================
async function fetchRegisteredBooks() {
    const tableBody = document.getElementById('books-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:15px;">Memuatkan data buku terkini...</td></tr>`;

    const filterDays = document.getElementById('loan-duration-filter')?.value || 'all';
    const filterStatus = document.getElementById('book-status-filter')?.value || 'all';
    const searchQuery = document.getElementById('log-search-input')?.value.toLowerCase().trim() || '';

    try {
        const { data: books, error } = await supabaseClient
            .from('books')
            .select(`
                *,
                library_loans(status, borrowed_at, students(name, class_name_full))
            `)
            .eq('school_id', currentSchoolId)
            .eq('is_active', true) 
            .order('created_at', { ascending: false });

        if (error) throw error;

        let countTotal = books.length;
        let countAvailable = 0; let countBorrowed = 0; let countOverdue = 0;
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
                    daysElapsed = (now - new Date(activeLoan.borrowed_at)) / (1000 * 60 * 60 * 24);
                    if (daysElapsed > LEWAT_THRESHOLD_DAYS) { countOverdue++; isOverdue = true; }
                }
            }

            let matchesStatus = (filterStatus === 'all') || 
                                (filterStatus === 'Available' && book.status === 'Available') || 
                                (filterStatus === 'Borrowed' && book.status === 'Borrowed') || 
                                (filterStatus === 'Overdue' && isOverdue);
            let matchesDuration = (filterDays === 'all') || (book.status === 'Borrowed' && daysElapsed > parseInt(filterDays));
            
            // LOGIK CARIAN DIKEMASKINI: Termasuk ISBN & Barcode
            let matchesSearch = true;
            if (searchQuery !== '') {
                matchesSearch = (book.title || '').toLowerCase().includes(searchQuery) || 
                                (book.author || '').toLowerCase().includes(searchQuery) ||
                                (book.isbn || '').toLowerCase().includes(searchQuery) ||
                                (book.book_barcode || '').toLowerCase().includes(searchQuery);
            }

            if (matchesStatus && matchesDuration && matchesSearch) {
                filteredBooks.push({ ...book, isOverdue, daysElapsed });
            }
        });

        // Kemaskini Kaunter Teks
        const countTextElement = document.getElementById('log-search-count');
        if (countTextElement) countTextElement.innerText = `${filteredBooks.length} jumlah buku ditemui`;

        if (document.getElementById('kpi-total')) document.getElementById('kpi-total').innerText = countTotal;
        if (document.getElementById('kpi-available')) document.getElementById('kpi-available').innerText = countAvailable;
        if (document.getElementById('kpi-borrowed')) document.getElementById('kpi-borrowed').innerText = countBorrowed;
        if (document.getElementById('kpi-overdue')) document.getElementById('kpi-overdue').innerText = countOverdue;

        if (filteredBooks.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:15px; color: #718096;">Tiada padanan data ditemui.</td></tr>`;
            return;
        }

        tableBody.innerHTML = '';

        filteredBooks.forEach((book, index) => {
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

            if (book.isOverdue) statusBadge += ` <span style="background-color: #e53e3e; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold; margin-left: 5px;">Lewat</span>`;

            let borrowerName = '-'; let borrowerClass = ''; let dateDisplay = '-';

            if (book.library_loans && book.library_loans.length > 0) {
                const activeLoan = book.library_loans.find(loan => loan.status === 'Active');
                if (activeLoan) {
                    borrowerName = activeLoan.students?.name || '-';
                    borrowerClass = activeLoan.students?.class_name_full || '';
                    if (activeLoan.borrowed_at) {
                        const d = new Date(activeLoan.borrowed_at);
                        dateDisplay = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    }
                }
            }

            // MENGGUNAKAN JADUAL BAHARU DENGAN PENOMBORAN (index + 1)
            tr.innerHTML = `
                <td style="padding: 12px; text-align: center; color: #718096; font-weight: bold;">${index + 1}</td>
                <td style="padding: 12px; font-family: monospace; font-weight: bold; color: #2b6cb0;">${book.book_barcode || '-'}</td>
                <td style="padding: 12px; font-family: monospace; font-size: 0.85rem; color: #718096;">${book.isbn || '-'}</td>
                <td style="padding: 12px; font-weight: 500; color: ${book.isOverdue ? '#c53030' : 'inherit'};">${book.title || 'Tiada Tajuk'}</td>
                <td style="padding: 12px; color: #4a5568;">${book.author || '-'}</td>
                <td style="padding: 12px;">${statusBadge}</td>
                <td style="padding: 12px; font-weight: 500;">
                    ${borrowerName} <br>
                    <span style="font-size: 0.85rem; color: #718096;">${borrowerClass}</span>
                </td>
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
        const { data: history, error } = await supabaseClient
            .from('library_loans')
            .select('*, books(title, book_barcode, is_active), students(name, class_name_full)')
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

            const bDate = new Date(record.borrowed_at);
            const borrowStr = `${String(bDate.getDate()).padStart(2, '0')}/${String(bDate.getMonth() + 1).padStart(2, '0')}/${bDate.getFullYear()} ${String(bDate.getHours()).padStart(2, '0')}:${String(bDate.getMinutes()).padStart(2, '0')}`;

            let returnStr = '<span style="color: #e53e3e; font-weight: bold;">Masih Dipinjam</span>';
            if (record.returned_at) {
                const rDate = new Date(record.returned_at);
                returnStr = `${String(rDate.getDate()).padStart(2, '0')}/${String(rDate.getMonth() + 1).padStart(2, '0')}/${rDate.getFullYear()} ${String(rDate.getHours()).padStart(2, '0')}:${String(rDate.getMinutes()).padStart(2, '0')}`;
            }

            const statusBadge = record.status === 'Returned' 
                ? `<span style="background-color: #e2e8f0; color: #4a5568; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;">Selesai</span>`
                : `<span style="background-color: #bee3f8; color: #2a4365; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;">Aktif</span>`;

            let bookTitleDisplay = '-';
            if (record.books) {
                if (record.books.is_active === false) {
                    bookTitleDisplay = `<span style="text-decoration: line-through; color: #a0aec0;">${record.books.title}</span> <span style="background-color: #fed7d7; color: #9b2c2c; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; margin-left: 5px;">Dilupuskan</span>`;
                } else {
                    bookTitleDisplay = record.books.title || 'Tiada Tajuk';
                }
            } else {
                bookTitleDisplay = `<span style="color: #e53e3e; font-weight: bold;">[Buku Dilupuskan]</span>`;
            }

            tr.innerHTML = `
                <td style="padding: 12px; color: #4a5568; font-size: 0.9rem;">${borrowStr}</td>
                <td style="padding: 12px; color: #4a5568; font-size: 0.9rem;">${returnStr}</td>
                <td style="padding: 12px; font-weight: 500; color: #2d3748;">${bookTitleDisplay}</td>
                <td style="padding: 12px;">${record.students?.name || '-'}</td>
                <td style="padding: 12px;">${record.students?.class_name_full || '-'}</td>
                <td style="padding: 12px;">${statusBadge}</td>
            `;
            tableBody.appendChild(tr);
        });
    } catch (error) {
        console.error("Ralat memuatkan sejarah:", error);
    }
}

// ==========================================
// RENDERING TAB INVENTORI BUKU (BARU)
// ==========================================
async function fetchInventoryBooks() {
    const activeTableBody = document.getElementById('inventory-active-table-body');
    const inactiveTableBody = document.getElementById('inventory-inactive-table-body');
    if (!activeTableBody || !inactiveTableBody) return;

    activeTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:15px;">Memuatkan senarai buku aktif...</td></tr>`;
    inactiveTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:15px;">Memuatkan rekod buku dilupuskan...</td></tr>`;

    const searchQuery = document.getElementById('inventori-search-input')?.value.toLowerCase().trim() || '';

    try {
        const { data: books, error } = await supabaseClient
            .from('books')
            .select('*')
            .eq('school_id', currentSchoolId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        activeTableBody.innerHTML = ''; inactiveTableBody.innerHTML = '';

        // LOGIK CARIAN DIKEMASKINI: Termasuk ISBN & Barcode
        let displayedBooks = books;
        if (searchQuery !== '') {
            displayedBooks = books.filter(book => 
                (book.title || '').toLowerCase().includes(searchQuery) || 
                (book.author || '').toLowerCase().includes(searchQuery) ||
                (book.isbn || '').toLowerCase().includes(searchQuery) ||
                (book.book_barcode || '').toLowerCase().includes(searchQuery)
            );
        }

        // Kemaskini Kaunter Teks Inventori
        const countTextElement = document.getElementById('inventori-search-count');
        if (countTextElement) countTextElement.innerText = `${displayedBooks.length} jumlah buku ditemui`;

        const activeBooks = displayedBooks.filter(b => b.is_active !== false);
        const inactiveBooks = displayedBooks.filter(b => b.is_active === false);

        // 1. PAPARAN JADUAL BUKU AKTIF
        if (activeBooks.length === 0) {
            activeTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:15px; color: #718096;">Tiada padanan buku aktif.</td></tr>`;
        } else {
            activeBooks.forEach((book, index) => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #e2e8f0';

                const d = new Date(book.created_at);
                const regDateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                
                let statusBadge = book.status === 'Available' 
                    ? `<span style="background-color: #c6f6d5; color: #22543d; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;">Ada</span>`
                    : `<span style="background-color: #bee3f8; color: #2a4365; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;">Dipinjam</span>`;

                tr.innerHTML = `
                    <td style="padding: 12px; text-align: center; color: #718096; font-weight: bold;">${index + 1}</td>
                    <td style="padding: 12px; font-family: monospace; font-weight: bold; color: #2b6cb0;">${book.book_barcode || '-'}</td>
                    <td style="padding: 12px; font-family: monospace; font-size: 0.85rem; color: #718096;">${book.isbn || '-'}</td>
                    <td style="padding: 12px;">
                        <div style="font-weight: 500; color: #2d3748;">${book.title || 'Tiada Tajuk'}</div>
                        <div style="font-size: 0.8rem; color: #718096; margin-top: 4px;">Terbitan: ${book.publisher || '-'} (${book.year_published || '-'})</div>
                    </td>
                    <td style="padding: 12px; color: #4a5568;">${book.author || '-'}</td>
                    <td style="padding: 12px;">${statusBadge}</td>
                    <td style="padding: 12px; color: #718096; font-size: 0.85rem;">${regDateStr}</td>
                    <td style="padding: 12px; text-align: center;">
                        <button class="btn-delete-book" style="background: #e53e3e; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-weight: bold;">Padam</button>
                    </td>
                `;
                const deleteBtn = tr.querySelector('.btn-delete-book');
                if (deleteBtn) deleteBtn.addEventListener('click', () => deleteBook(book.id, book.title));
                activeTableBody.appendChild(tr);
            });
        }

        // 2. PAPARAN JADUAL BUKU TIDAK AKTIF (DILUPUSKAN)
        if (inactiveBooks.length === 0) {
            inactiveTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:15px; color: #cbd5e0;">Tiada rekod pelupusan buku.</td></tr>`;
        } else {
            inactiveBooks.forEach((book, index) => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #edf2f7';
                tr.style.backgroundColor = '#fcfcfc';

                const regDateStr = new Date(book.created_at).toLocaleDateString('ms-MY');
                const removalDateStr = book.updated_at ? new Date(book.updated_at).toLocaleDateString('ms-MY') : '-';

                tr.innerHTML = `
                    <td style="padding: 12px; text-align: center; color: #a0aec0; font-weight: bold;">${index + 1}</td>
                    <td style="padding: 12px; font-family: monospace; color: #a0aec0;">${book.book_barcode || '-'}</td>
                    <td style="padding: 12px; font-family: monospace; font-size: 0.85rem; color: #a0aec0;">${book.isbn || '-'}</td>
                    <td style="padding: 12px; text-decoration: line-through; color: #a0aec0;">
                        <div style="font-weight: 500;">${book.title || 'Tiada Tajuk'}</div>
                        <div style="font-size: 0.8rem; margin-top: 4px;">Terbitan: ${book.publisher || '-'} (${book.year_published || '-'})</div>
                    </td>
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
    }
}

function switchInventoriTab(tab) {
    if (tab === 'ACTIVE') {
        document.getElementById('inv-active-section').classList.remove('hidden');
        document.getElementById('inv-inactive-section').classList.add('hidden');
        document.getElementById('btn-inv-active').classList.add('active');
        document.getElementById('btn-inv-inactive').classList.remove('active');
    } else {
        document.getElementById('inv-active-section').classList.add('hidden');
        document.getElementById('inv-inactive-section').classList.remove('hidden');
        document.getElementById('btn-inv-active').classList.remove('active');
        document.getElementById('btn-inv-inactive').classList.add('active');
    }
}

// ==========================================
// FUNGSI UTILITI TAMBAHAN
// ==========================================
async function deleteBook(bookId, bookTitle) {
    if (!confirm(`AMARAN KERAS!\nLupuskan buku "${bookTitle}" daripada inventori aktif?`)) return;
    try {
        const { error } = await supabaseClient.from('books').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', bookId);
        if (error) throw error;
        alert(`"${bookTitle}" telah dilupuskan.`);
        fetchInventoryBooks(); fetchRegisteredBooks();
    } catch (error) {
        alert(`System Error: ${error.message}`);
    }
}

function printReport() { window.print(); }

function exportCSV() {
    const table = document.getElementById("log-table");
    let csvContent = "data:text/csv;charset=utf-8,";
    const rows = table.querySelectorAll("tr");

    rows.forEach(row => {
        let rowData = [];
        const cols = row.querySelectorAll("th, td");
        for(let i = 0; i < cols.length - 1; i++) {
            let text = cols[i].innerText.replace(/(\r\n|\n|\r)/gm, " ").replace(/,/g, " ");
            rowData.push(text);
        }
        csvContent += rowData.join(",") + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Laporan_Pinjaman_Buku_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================================
// KAWALAN POP-UP INFO KHAS UNTUK SKRIN TABLET / TELEFON (FIX)
// ==========================================================
function handleInfoClick(event, element) {
    event.stopPropagation(); // Menghalang navigasi bertukar skrin secara tidak sengaja

    // Hanya aktifkan modal popup sekiranya peranti berada dalam mod tablet/telefon
    if (window.innerWidth <= 992) {
        const infoMessage = element.getAttribute('data-tooltip');
        
        // Memaparkan info menggunakan dialog sistem yang bersih & anti-terpotong
        alert(`ℹ️ Info Bahagian:\n\n${infoMessage}`);
    }
}

// ==========================================
// PUSAT KAWALAN UTAMA (INITIALIZATION)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // 1. SEMAK STATUS SESI LOG MASUK TERKINI (SUPABASE AUTH)
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session && session.user) {
        showApp(session.user); // Ini akan memanggil fetchStudents() & focus/view secara automatik
    } else {
        showLogin();
    }

    // 2. KAWALAN INPUT PENGIMBAS (KAUNTER SIRKULASI)
    const scanInput = document.getElementById('library-scan-input');
    if (scanInput) {
        scanInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const barcodeValue = scanInput.value.trim();
                scanInput.value = ''; 
                if (barcodeValue) await handleIncomingBarcode(barcodeValue);
            }
        });
    }

    // 3. KAWALAN INPUT PENGIMBAS (CARIAN ISBN DI KATALOG)
    const isbnInput = document.getElementById('isbn-input');
    if (isbnInput) {
        isbnInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                await lookupISBN();
            }
        });
    }

    // 🌟 OPTIMASI IMBAHAN 1: Hantar data terus selepas imbas Kod Bar Unik (API)
    const uniqueBarcodeInput = document.getElementById('isbn-unique-barcode');
    if (uniqueBarcodeInput) {
        uniqueBarcodeInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                await uploadISBNData(); // Terus simpan buku tanpa perlu klik skrin
            }
        });
    }

    // 🌟 OPTIMASI IMBAHAN 2: Lompat input secara automatik (Pendaftaran Manual)
    const manualBarcode = document.getElementById('manual-barcode');
    if (manualBarcode) {
        manualBarcode.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const manualIsbn = document.getElementById('manual-isbn');
                if (manualIsbn) manualIsbn.focus(); // Kursor lompat ke kotak ISBN
            }
        });
    }

    const manualIsbn = document.getElementById('manual-isbn');
    if (manualIsbn) {
        manualIsbn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const manualTitle = document.getElementById('manual-title');
                if (manualTitle) manualTitle.focus(); // Kursor lompat ke kotak Tajuk
            }
        });
    }

    // 4. KAWALAN TAPISAN & CARIAN JADUAL LOG
    const filters = ['book-status-filter', 'loan-duration-filter', 'log-search-input'];
    filters.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(id.includes('search') ? 'input' : 'change', fetchRegisteredBooks);
    });

    // 5. KAWALAN CARIAN JADUAL INVENTORI
    const inventoriSearch = document.getElementById('inventori-search-input');
    if (inventoriSearch) inventoriSearch.addEventListener('input', fetchInventoryBooks);

    // 6. KAWALAN PENGURUSAN CSV (DROPZONE)
    const dropzone = document.getElementById('csv-dropzone');
    const fileInput = document.getElementById('csv-file-input');
    if (dropzone && fileInput) {
        ['dragenter', 'dragover'].forEach(eventName => dropzone.addEventListener(eventName, e => { e.preventDefault(); dropzone.style.background = '#edf2f7'; }, false));
        ['dragleave', 'drop'].forEach(eventName => dropzone.addEventListener(eventName, e => { e.preventDefault(); dropzone.style.background = '#f7fafc'; }, false));
        dropzone.addEventListener('drop', e => { const dt = e.dataTransfer; if (dt.files.length) processCSVFile(dt.files[0]); });
        fileInput.addEventListener('change', () => { if (fileInput.files.length) processCSVFile(fileInput.files[0]); });
    }
});

function toggleKioskMode(isLocked) {
    const sidebar = document.querySelector('.library-sidebar');
    const scanInput = document.getElementById('library-scan-input');
    if (isLocked) { sidebar.style.display = 'none'; scanInput.focus(); } 
    else { sidebar.style.display = 'flex'; }
}

const scannerInput = document.getElementById('library-scan-input');
document.addEventListener('click', (e) => {
    const sidebar = document.querySelector('.library-sidebar');
    if (sidebar.style.display === 'none' && document.activeElement !== scannerInput) scannerInput.focus();
});
scannerInput.addEventListener('blur', () => setTimeout(() => scannerInput.focus(), 100));

let tapCount = 0; let tapTimer = null;
const triggerBtn = document.getElementById('kiosk-trigger');
if (triggerBtn) {
    triggerBtn.addEventListener('click', () => {
        tapCount++;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => { tapCount = 0; }, 2000);
        if (tapCount === 5) {
            const sidebar = document.querySelector('.library-sidebar');
            const isCurrentlyLocked = (sidebar.style.display === 'none');
            toggleKioskMode(isCurrentlyLocked ? false : true);
            tapCount = 0;
            alert(isCurrentlyLocked ? "Sistem Dibuka (Admin Mode)" : "Sistem Dikunci (Kiosk Mode)");
        }
    });
}