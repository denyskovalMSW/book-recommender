from flask import Flask, request, jsonify
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.model_selection import train_test_split
from scipy.sparse import csr_matrix

# Створення Flask-додатку
app = Flask(__name__)

# Завантаження даних
books = pd.read_csv('books.csv')
ratings = pd.read_csv('ratings.csv')

# Підготовка даних для метаданих
books = books[['book_id', 'title', 'authors', 'average_rating', 'original_publication_year',
               'language_code', 'ratings_count', 'work_ratings_count', 'work_text_reviews_count']]

# Обробка пропущених значень
books.fillna({
    'original_publication_year': 'Unknown',
    'language_code': 'Unknown',
    'ratings_count': 0
}, inplace=True)

# Створення метаданих
books['metadata'] = (
        books['title'] + ' ' +
        books['authors'] + ' ' +
        books['original_publication_year'].astype(str) + ' ' +
        books['language_code'] + ' ' +
        books['average_rating'].astype(str) + ' ' +
        books['ratings_count'].astype(str) + ' ' +
        books['work_ratings_count'].astype(str) + ' ' +
        books['work_text_reviews_count'].astype(str)
)

# Використання метаданих для векторизації
vectorizer = TfidfVectorizer(stop_words='english')
metadata_matrix = vectorizer.fit_transform(books['metadata'])

# Обчислення косинусної схожості для метаданих
cosine_sim_metadata = cosine_similarity(metadata_matrix, metadata_matrix)

# Підготовка даних для колаборативної фільтрації
ratings = ratings[
    ratings['user_id'].isin(ratings['user_id'].value_counts()[ratings['user_id'].value_counts() > 10].index)]
ratings = ratings[
    ratings['book_id'].isin(ratings['book_id'].value_counts()[ratings['book_id'].value_counts() > 20].index)]

# Створення розрідженої матриці для колаборативної фільтрації
ratings_matrix = ratings.pivot(index='user_id', columns='book_id', values='rating').fillna(0).astype('float32')
ratings_sparse = csr_matrix(ratings_matrix.values)

# Обчислення косинусної схожості для колаборативної фільтрації
cosine_sim_collab = cosine_similarity(ratings_sparse.T)
print("ready")

# Функція для рекомендацій на основі метаданих
def recommend_books_metadata(favorite_books, n=10):
    indices = [books[books['title'] == book_title].index[0] for book_title in favorite_books if
               book_title in books['title'].values]

    if not indices:
        return []

    # Нормалізація вкладу кожної книги
    sim_scores = sum(cosine_sim_metadata[idx] for idx in indices) / len(indices)
    ranked_indices = sim_scores.argsort()[::-1]
    ranked_indices = [i for i in ranked_indices if i not in indices]
    top_indices = ranked_indices[:n]

    # Фільтрація рекомендацій
    top_books = books.iloc[top_indices]

    return top_books[['title', 'authors', 'average_rating', 'original_publication_year', 'language_code']].to_dict(
        orient='records')


# Функція для рекомендацій на основі колаборативної фільтрації
def recommend_books_collab(favorite_books, n=10):
    cosine_sim_df = pd.DataFrame(cosine_sim_collab, index=ratings_matrix.columns, columns=ratings_matrix.columns)
    indices = [book_id for book_id in favorite_books if book_id in cosine_sim_df.index]

    if not indices:
        return []

    sim_scores = sum(cosine_sim_df[book_id] for book_id in indices)
    sim_scores = sim_scores.sort_values(ascending=False)
    sim_scores = sim_scores[~sim_scores.index.isin(indices)]

    return sim_scores.head(n).index.tolist()


# Функція для гібридних рекомендацій
def recommend_books_hybrid(favorite_books, n=10, alpha=0.5):
    # Отримуємо рекомендації для обох методів
    user_titles = books[books['book_id'].isin(favorite_books)]['title'].tolist()
    metadata_recommendations = recommend_books_metadata(user_titles, n)
    collab_recommendations = recommend_books_collab(favorite_books, n)

    # Комбінуємо рекомендації
    hybrid_recommendations = {}

    # Обробка контентних рекомендацій
    for rec in metadata_recommendations:
        # Додаємо рейтинг книги до ваги
        avg_rating = rec['average_rating']
        hybrid_recommendations[rec['title']] = hybrid_recommendations.get(rec['title'], 0) + avg_rating + alpha

    # Обробка колаборативних рекомендацій
    for book_id in collab_recommendations:
        book_row = books[books['book_id'] == book_id]
        book_title = book_row['title'].values[0]
        avg_rating = book_row['average_rating'].values[0]
        hybrid_recommendations[book_title] = hybrid_recommendations.get(book_title, 0) + avg_rating + (1 - alpha)

    # Сортуємо за вагою
    sorted_recommendations = sorted(hybrid_recommendations.items(), key=lambda x: x[1], reverse=True)

    # Повертаємо топ-n книг
    top_books = [book[0] for book in sorted_recommendations[:n]]
    print(f"Top {n} recommendations:\n{top_books}\n")

    return [{'title': book} for book in top_books]


# Оцінка результатів
def evaluate_recommendations():
    test_users = ratings['user_id'].unique()[:10000]
    ratings1 = ratings[ratings['user_id'].isin(test_users)]
    train_ratings, test_ratings = train_test_split(ratings1, test_size=0.3, random_state=42)
    total_hits = 0
    total_recommendations = 0
    total_relevant = 0

    for user_id, group in test_ratings.groupby('user_id'):
        user_books = train_ratings[train_ratings['user_id'] == user_id]['book_id'].tolist()
        test_books = group['book_id'].tolist()

        if not user_books or not test_books:
            continue

        recommendations = recommend_books_hybrid(user_books, n=10, alpha = 0.3)

        recommended_ids = books[books['title'].isin([rec['title'] for rec in recommendations])]['book_id'].tolist()

        hits = len(set(recommended_ids) & set(test_books))
        total_hits += hits
        print(f"User {user_id} hits: {hits}")
        total_recommendations += len(recommended_ids)
        total_relevant += len(test_books)

    precision = total_hits / total_recommendations if total_recommendations else 0
    recall = total_hits / total_relevant if total_relevant else 0
    f1_score = (2 * precision * recall) / (precision + recall) if precision + recall > 0 else 0

    return precision, recall, f1_score


# Створення маршруту для рекомендацій
@app.route('/recommend', methods=['POST'])
def recommend():
    data = request.get_json()
    favorite_books = data.get('favorites', [])
    print(f"Received favorite_books: {favorite_books}")

    # Конвертація в числа
    try:
        favorite_books = [int(book_id) for book_id in favorite_books]
    except ValueError:
        return jsonify({'error': 'Invalid format of favorite books'}), 400

    if not favorite_books:
        return jsonify({'error': 'List of favorite books is required'}), 400

    recommendations = recommend_books_hybrid(favorite_books)
    return jsonify({'recommendations': recommendations})


if __name__ == '__main__':
    #precision, recall, f1 = evaluate_recommendations()
    #print(f"Precision: {precision:.2f}")
    #print(f"Recall: {recall:.2f}")
    #print(f"F1 Score: {f1:.2f}")
    app.run(debug=False)