window.onload = async function() {
    const nickname = localStorage.getItem("nickname");
    const userActionsDiv = document.querySelector(".user-actions");
    const currentPage = window.location.pathname.split("/").pop();
    
    // Перевірка, чи ми на сторінці account.html
    if (currentPage === "account.html") {
        if (!nickname) {
            // Якщо нікнейм не знайдено, перекидаємо на сторінку входу
            window.location.href = "login.html";
            return; // Виходимо з функції, щоб не виконувати решту коду
        }

        // Якщо нікнейм є, вставляємо його
        const nicknameElement = document.getElementById("username");
        if (nicknameElement) {
            nicknameElement.textContent = nickname; // Вставляємо нікнейм
        }
        loadUserAccount()
    }
    if (userActionsDiv) {
        if (nickname) {
            // Якщо нікнейм є в пам'яті, показуємо нікнейм та посилання на вихід
            userActionsDiv.innerHTML = `Вітаємо, ${nickname}! | <a href="#" id="logout-link">Вихід</a>`;
            document.getElementById("logout-link").addEventListener("click", function(event) {
                event.preventDefault();
                localStorage.removeItem("nickname");
                window.location.href = "login.html"; // Перенаправлення на сторінку входу
            });
        } else {
            // Якщо нікнейм немає, показуємо посилання на вхід та реєстрацію
            userActionsDiv.innerHTML = '<a href="login.html">Вхід</a> | <a href="register.html">Реєстрація</a>';
        }
    }
    if(currentPage ==="books.html"){
        await displayBooks();
        const message = localStorage.getItem('favoriteBooksMessage');
        if (message) {
            alert(message);
            localStorage.removeItem('favoriteBooksMessage'); // Очищення повідомлення після показу
        }
            // Обробник події для сортування за алфавітом
            document.getElementById('sort-alphabetically').addEventListener('click', () => {
                displayBooks(1, document.getElementById('search-input').value, 'alphabetically');
            });
            
            // Обробник події для сортування за рейтингом
            document.getElementById('sort-by-rating').addEventListener('click', () => {
                displayBooks(1, document.getElementById('search-input').value, 'byRating');
            });
            
            // Обробник для пошуку
            document.getElementById('search-button').addEventListener('click', () => {
                const query = document.getElementById('search-input').value;
                displayBooks(1, query);
    });
    }
    if (currentPage === "recommendations.html") {
        console.log('Попали на recommendations');
        loadRecommendations();
    }
    if(currentPage ==="services.html"){
    console.log('Popali v sercices');
    document.getElementById('subscribeBtn').addEventListener('click', async () => {
        const nickname = localStorage.getItem("nickname");
        if (!nickname) {
            alert("Вам потрібно увійти, щоб оформити підписку!");
            return;
        }
    
        try {
            const response = await fetch('/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ nickname })
            });
    
            const result = await response.json();
            if (result.success) {
                alert('Підписка успішно оформлена!');
            } else {
                alert(result.message || 'Не вдалося оформити підписку.');
            }
        } catch (error) {
            console.error('Помилка при оформленні підписки:', error);
        }
    });

    document.getElementById('favoriteBooksBtn').addEventListener('click', () => {
        // Створення повідомлення після переходу
        localStorage.setItem('favoriteBooksMessage', 'Оберіть улюблені книги');
        // Перехід на нову сторінку
        window.location.href = 'books.html';
        
    });
    document.getElementById('getRecommendationsBtn').addEventListener('click', async () => {
        const nickname = localStorage.getItem("nickname");
        if (!nickname) {
            alert("Вам потрібно увійти, щоб отримати рекомендації!");
            return;
        }

        try {
            const response = await fetch('/get-recommendations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ nickname })
            });

            const result = await response.json();
            if (result.success) {
                // Зберігаємо рекомендації у localStorage або переходимо на сторінку рекомендацій
                localStorage.setItem('recommendations', JSON.stringify(result.recommendations));
                window.location.href = 'recommendations.html';
            } else {
                alert(result.message || 'Не вдалося отримати рекомендації.');
            }
        } catch (error) {
            console.error('Помилка при отриманні рекомендацій:', error);
        }
    });
}

async function loadRecommendations() {
    console.log('Старт функції loadRecommendations');
    const recommendationsContainer = document.getElementById('recommendations-container');
    const storedData = JSON.parse(localStorage.getItem('recommendations'));
    console.log('Дані з localStorage:', storedData);

    if (!storedData || !Array.isArray(storedData.recommendations) || storedData.recommendations.length === 0) {
        recommendationsContainer.innerHTML = '<p>Немає рекомендацій для відображення.</p>';
        return;
    }

    recommendationsContainer.innerHTML = ''; // Очищаємо контейнер

    // Завантажуємо всі книги
    const allBooks = await loadBooks();
    console.log('Усі книги:', allBooks);

    // Функція для пошуку книги з альтернативними колонками
    function findBookWithFallback(title) {
        return allBooks.find(book => {
            const normalizedTitle = title.trim().toLowerCase();
            return Object.values(book).some(value => 
                value && String(value).trim().toLowerCase() === normalizedTitle
            );
        });
    }

    // Шукаємо деталі книг
    const detailedRecommendations = storedData.recommendations
        .filter(rec => rec && typeof rec.title === 'string') // Захист від невірних даних
        .map(rec => {
            const book = findBookWithFallback(rec.title);
            if (!book) {
                console.warn(`Книга "${rec.title}" не знайдена в базі.`);
            }
            return book;
        })
        .filter(Boolean); // Видаляємо undefined, якщо книгу не знайдено

    console.log('Детальні рекомендації:', detailedRecommendations);

    if (detailedRecommendations.length === 0) {
        recommendationsContainer.innerHTML = '<p>Рекомендовані книги не знайдено в базі даних.</p>';
        return;
    }

    //Відображаємо деталі книг
    detailedRecommendations.forEach(book => {
        const bookElement = document.createElement('div');
        bookElement.className = 'book';
        bookElement.innerHTML = `
            <h3>${book.title || 'Назва не вказана'}</h3>
            <p><strong>Автор:</strong> ${book.authors || 'Автор не вказаний'}</p>
            <p><strong>Рейтинг:</strong> ${book.average_rating || 'Рейтинг не доступний'}</p>
            <p><strong>Кількість оцінок:</strong> ${book.ratings_count || 'Дані відсутні'}</p>
            <p><strong>Рік публікації:</strong> ${book.original_publication_year || 'Невідомо'}</p>
            <p><strong>Мова:</strong> ${book.language_code || 'Не вказано'}</p>
            <p><strong>Кількість відгуків:</strong> ${book.work_text_reviews_count || 'Дані відсутні'}</p>
            <p><strong>Рейтинг за роботою:</strong> ${book.work_ratings_count || 'Дані відсутні'}</p>
            <p><strong>ID книги:</strong> ${book.book_id}</p>
            <p><strong>Обкладинка:</strong> <img src="${book.image_url || 'default_image.jpg'}" alt="Обкладинка книги" width="100"></p>
            <p><strong>Мала обкладинка:</strong> <img src="${book.small_image_url || 'default_image_small.jpg'}" alt="Мала обкладинка книги" width="50"></p>
        `;
        recommendationsContainer.appendChild(bookElement);
    });
}
}

// Парсинг CSV для нового датасету
async function loadBooks() {
    const response = await fetch('books.csv'); // Завантажуємо CSV-файл
    const csvData = await response.text(); // Читаємо його як текст

    // Використовуємо PapaParse для парсингу
    const result = Papa.parse(csvData, {
        header: true, // Перша лінія - це заголовок колонок
        skipEmptyLines: true // Пропускаємо пусті строки
    });

    // Перевірка на помилки
    if (result.errors.length > 0) {
        console.error('Помилки парсингу:', result.errors);
        return [];
    }

    // Повертаємо список об'єктів книг
    return result.data.map(row => ({
        book_id: row.book_id,
        title: row.title,
        authors: row.authors,
        average_rating: row.average_rating,
        ratings_count: row.ratings_count,
        original_publication_year: row.original_publication_year,
        language_code: row.language_code,
        work_ratings_count: row.work_ratings_count,
        work_text_reviews_count: row.work_text_reviews_count,
        image_url: row.image_url, // URL обкладинки книги
        small_image_url: row.small_image_url // Мала версія обкладинки
    }));
}

// Функція для відображення книг на сторінці
async function displayBooks(page = 1, query = '', sort = '') {
    try {
        const books = await loadBooks(); // Завантажуємо всі книги з нового датасету
        const booksContainer = document.getElementById('books-container'); // Контейнер для книг
        booksContainer.innerHTML = ''; // Очищаємо контейнер перед відображенням нових книг

        if (!books || books.length === 0) {
            booksContainer.innerHTML = '<p>Немає доступних книг.</p>';
            return;
        }

        // Фільтруємо книги за запитом
        let filteredBooks = books.filter(book => 
            book.title && book.title.toLowerCase().includes(query.toLowerCase())
        );

        // Сортуємо книги відповідно до вибраної опції
        if (sort === 'alphabetically') {
            filteredBooks.sort((a, b) => a.title.localeCompare(b.title));
        } else if (sort === 'byRating') {
            filteredBooks.sort((a, b) => b.average_rating - a.average_rating);
        }

        if (filteredBooks.length === 0) {
            booksContainer.innerHTML = '<p>Нічого не знайдено.</p>';
            return;
        }

        // Розрахунок початкового та кінцевого індексів для пагінації
        const itemsPerPage = 30;
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;

        // Відображаємо книги для поточної сторінки
        filteredBooks.slice(startIndex, endIndex).forEach(book => {
            const bookElement = document.createElement('div');
            bookElement.className = 'book';
            bookElement.innerHTML = `
                <h3>${book.title || 'Назва не вказана'}</h3>
                <p><strong>Автор:</strong> ${book.authors || 'Автор не вказаний'}</p>
                <p><strong>Рейтинг:</strong> ${book.average_rating || 'Рейтинг не доступний'}</p>
                <p><strong>Кількість оцінок:</strong> ${book.ratings_count || 'Дані відсутні'}</p>
                <p><strong>Рік публікації:</strong> ${book.original_publication_year || 'Невідомо'}</p>
                <p><strong>Мова:</strong> ${book.language_code || 'Не вказано'}</p>
                <p><strong>Кількість відгуків:</strong> ${book.work_text_reviews_count || 'Дані відсутні'}</p>
                <p><strong>Рейтинг за роботою:</strong> ${book.work_ratings_count || 'Дані відсутні'}</p>
                <p><strong>ID книги:</strong> ${book.book_id}</p>
                <p><strong>Обкладинка:</strong> <img src="${book.image_url || 'default_image.jpg'}" alt="Обкладинка книги" width="100"></p>
                <p><strong>Мала обкладинка:</strong> <img src="${book.small_image_url || 'default_image_small.jpg'}" alt="Мала обкладинка книги" width="50"></p>
                <button class="favorite-button" onclick="addToFavorites('${book.book_id}')">Додати до улюблених</button>
            `;
            bookElement.addEventListener('click', function() {
                bookElement.classList.toggle('active');
            });
            booksContainer.appendChild(bookElement);
        });

        // Додаємо кнопки для пагінації
        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'pagination';

        const totalPages = Math.ceil(filteredBooks.length / itemsPerPage);
        for (let i = 1; i <= totalPages; i++) {
            const pageButton = document.createElement('button');
            pageButton.innerText = i;
            pageButton.onclick = () => displayBooks(i, query, sort);
            paginationContainer.appendChild(pageButton);
        }

        booksContainer.appendChild(paginationContainer); // Додаємо пагінацію в контейнер книг

    } catch (error) {
        console.error('Помилка при завантаженні книг:', error);
        booksContainer.innerHTML = '<p>Виникла помилка при завантаженні книг.</p>';
    }
}



async function addToFavorites(bookId) {
    const nickname = localStorage.getItem("nickname");
    if (!nickname) {
        alert("Вам потрібно увійти, щоб додавати книги до улюблених!");
        return;
    }

    try {
        const response = await fetch('/add-to-favorites', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nickname, bookId })
        });

        const result = await response.json();
        if (result.success) {
            alert('Книга успішно додана до улюблених!');
        } else {
            alert(result.message || 'Не вдалося додати книгу до улюблених.');
        }
    } catch (error) {
        console.error('Помилка при додаванні книги:', error);
    }
}

async function loadUserAccount() {
    const nickname = localStorage.getItem("nickname");
    if (!nickname) {
        alert("Вам потрібно увійти, щоб переглядати свій акаунт!");
        return;
    }

    try {
        const response = await fetch('/get-user-info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nickname })
            
        });
        const result = await response.json();
        if (result.success) {
            // Відображаємо нікнейм
            document.getElementById("username").innerText = `Привіт, ${nickname}!`;
            // Оновлюємо статус читацького квитка
            const statusText = result.sub_status ? "Активний" : "Неактивний";
            document.querySelector('#sub_status').innerHTML = `<strong>Статус читацького квитка:</strong> ${statusText}`;
            // Оновлюємо список улюблених книг
            const favoriteBooksList = document.querySelector('.favorite-books ul');
            favoriteBooksList.innerHTML = ''; // Очищаємо список

            // Перевірка наявності улюблених книг перед їх використанням
            if (result.favorite_books && result.favorite_books.length > 0) {
                const favoriteBookIds = result.favorite_books.map(book => book.book_id);
                updateFavoriteBooks(favoriteBookIds);
            } else {
                favoriteBooksList.innerHTML = '<li>Поки що немає улюблених книг.</li>';
            }
        } else {
            alert(result.message || 'Не вдалося отримати інформацію про акаунт.');
        }
    } catch (error) {
        console.error('Помилка при завантаженні інформації про користувача:', error);
    }
}

async function updateFavoriteBooks(favoriteBookIds) {
    try {
        const books = await loadBooks(); // Завантажуємо всі книги з CSV
        const favoriteBooksList = document.querySelector('.favorite-books ul');
        favoriteBooksList.innerHTML = ''; // Очищаємо список

        // Перевірка наявності улюблених книг
        if (favoriteBookIds && favoriteBookIds.length > 0) {
            // Знаходимо книги за їх ID
            const favoriteBooks = books.filter(book => favoriteBookIds.includes(book.book_id));

            if (favoriteBooks.length > 0) {
                favoriteBooks.forEach(book => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <strong>${book.title || 'Назва не вказана'}</strong><br>
                        <strong>Автор:</strong> ${book.authors || 'Автор не вказаний'}<br>
                        <strong>Рейтинг:</strong> ${book.average_rating || 'Рейтинг не доступний'}<br>
                        <strong>Кількість оцінок:</strong> ${book.ratings_count || 'Дані відсутні'}<br>
                        <strong>Рік публікації:</strong> ${book.original_publication_year || 'Невідомо'}<br>
                        <strong>Мова:</strong> ${book.language_code || 'Не вказано'}<br>
                        <strong>Кількість відгуків:</strong> ${book.work_text_reviews_count || 'Дані відсутні'}<br>
                        <strong>Рейтинг за роботою:</strong> ${book.work_ratings_count || 'Дані відсутні'}<br>
                        <strong>ID книги:</strong> ${book.book_id}<br>
                        <strong>Обкладинка:</strong> <img src="${book.image_url || 'default_image.jpg'}" alt="Обкладинка книги" width="100"><br>
                        <strong>Мала обкладинка:</strong> <img src="${book.small_image_url || 'default_image_small.jpg'}" alt="Мала обкладинка книги" width="50"><br>
                    `;
                    favoriteBooksList.appendChild(li);
                });
            } else {
                favoriteBooksList.innerHTML = '<li>Поки що немає улюблених книг.</li>';
            }
        } else {
            favoriteBooksList.innerHTML = '<li>Поки що немає улюблених книг.</li>';
        }
    } catch (error) {
        console.error('Помилка при оновленні улюблених книг:', error);
        favoriteBooksList.innerHTML = '<li>Виникла помилка при завантаженні улюблених книг.</li>';
    }
}