using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.Extensions.Configuration;
using System;
using System.Data.SqlClient;
using System.Reflection;
using System.Security.Cryptography;
using static System.Reflection.Metadata.BlobBuilder;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// Додаємо підтримку статичних файлів
app.UseStaticFiles();

// Зчитуємо рядок підключення з appsettings.json
var configuration = builder.Configuration;
var connectionString = configuration.GetConnectionString("DefaultConnection");

// Ендпойнт для реєстрації
app.MapPost("/register", async (HttpContext context) =>
{
    var form = await context.Request.ReadFormAsync();
    string username = form["username"];
    string email = form["email"];
    string password = form["password"];

    // Генеруємо salt і хешуємо пароль
    byte[] salt = GenerateSalt();
    byte[] hash = HashPassword(password, salt);

    // Конвертуємо у Base64 для зберігання у базі
    string saltBase64 = Convert.ToBase64String(salt);
    string hashBase64 = Convert.ToBase64String(hash);

    // Зберігаємо дані у базі даних
    using (SqlConnection connection = new SqlConnection(connectionString))
    {
        try
        {
            await connection.OpenAsync();
            string query = "INSERT INTO Users (login, email, pass_hash, salt) VALUES (@login, @email, @pass_hash, @salt)";

            using (SqlCommand command = new SqlCommand(query, connection))
            {
                command.Parameters.AddWithValue("@login", username);
                command.Parameters.AddWithValue("@email", email);
                command.Parameters.AddWithValue("@pass_hash", hashBase64);
                command.Parameters.AddWithValue("@salt", saltBase64);
                await command.ExecuteNonQueryAsync();
            }

            return Results.Json(new { success = true, message = "Користувача успішно зареєстровано." });
        }
        catch (Exception ex)
        {
            return Results.Json(new { success = false, message = "Спробуйте інший логін." });
        }
    }
});

// Ендпойнт для входу
app.MapPost("/login", async (HttpContext context) =>
{
    var form = await context.Request.ReadFormAsync();
    string username = form["username"];
    string password = form["password"];

    using (SqlConnection connection = new SqlConnection(connectionString))
    {
        try
        {
            await connection.OpenAsync();
            string query = "SELECT pass_hash, salt FROM Users WHERE login = @login";
            using (SqlCommand command = new SqlCommand(query, connection))
            {
                command.Parameters.AddWithValue("@login", username);
                using (SqlDataReader reader = await command.ExecuteReaderAsync())
                {
                    if (await reader.ReadAsync())
                    {
                        string savedPasswordHash = reader["pass_hash"].ToString();
                        string savedSalt = reader["salt"].ToString();

                        byte[] saltBytes = Convert.FromBase64String(savedSalt);

                        using (var pbkdf2 = new Rfc2898DeriveBytes(password, saltBytes, 10000, HashAlgorithmName.SHA256))
                        {
                            byte[] enteredPasswordHashBytes = pbkdf2.GetBytes(32);
                            string enteredPasswordHash = Convert.ToBase64String(enteredPasswordHashBytes);

                            if (savedPasswordHash.Equals(enteredPasswordHash))
                            {
                                return Results.Json(new { success = true, nickname = username }); // Повертаємо успішну відповідь
                            }
                        }
                    }
                }
            }

            return Results.Json(new { success = false, message = "Невірний логін або пароль." });
        }
        catch (Exception ex)
        {
            return Results.Json(new { success = false, message = $"Error: {ex.Message}" });
        }
    }
});

app.MapPost("/add-to-favorites", async (HttpContext context) =>
{
    var body = await context.Request.ReadFromJsonAsync<Dictionary<string, string>>();
    if (body == null || !body.TryGetValue("nickname", out string nickname) || !body.TryGetValue("bookId", out string bookId))
    {
        return Results.Json(new { success = false, message = "Неправильні дані." });
    }

    using (SqlConnection connection = new SqlConnection(connectionString))
    {
        try
        {
            await connection.OpenAsync();

            // Отримуємо поточні улюблені книги користувача
            string selectQuery = "SELECT favorite_books FROM users WHERE login = @login";
            string currentFavorites = string.Empty;

            using (SqlCommand selectCommand = new SqlCommand(selectQuery, connection))
            {
                selectCommand.Parameters.AddWithValue("@login", nickname);
                var result = await selectCommand.ExecuteScalarAsync();
                currentFavorites = result?.ToString();
            }

            // Оновлюємо список улюблених книг
            string updatedFavorites = string.IsNullOrEmpty(currentFavorites) ? bookId : $"{currentFavorites},{bookId}";

            string updateQuery = "UPDATE users SET favorite_books = @favorite_books WHERE login = @login";
            using (SqlCommand updateCommand = new SqlCommand(updateQuery, connection))
            {
                updateCommand.Parameters.AddWithValue("@favorite_books", updatedFavorites);
                updateCommand.Parameters.AddWithValue("@login", nickname);
                await updateCommand.ExecuteNonQueryAsync();
            }

            return Results.Json(new { success = true });
        }
        catch (Exception ex)
        {
            return Results.Json(new { success = false, message = $"Помилка: {ex.Message}" });
        }
    }
});

app.MapPost("/subscribe", async (HttpContext context) =>
{
    var body = await context.Request.ReadFromJsonAsync<Dictionary<string, string>>();
    if (body == null || !body.TryGetValue("nickname", out string nickname))
    {
        return Results.Json(new { success = false, message = "Неправильні дані." });
    }

    using (SqlConnection connection = new SqlConnection(connectionString))
    {
        try
        {
            await connection.OpenAsync();

            // Перевіряємо статус підписки
            string selectQuery = "SELECT sub_status FROM users WHERE login = @login";
            int subscriptionStatus = 0;

            using (SqlCommand selectCommand = new SqlCommand(selectQuery, connection))
            {
                selectCommand.Parameters.AddWithValue("@login", nickname);
                var result = await selectCommand.ExecuteScalarAsync();
                subscriptionStatus = result != null ? Convert.ToInt32(result) : 0;
            }

            // Якщо підписка вже оформлена, повертаємо повідомлення
            if (subscriptionStatus == 1)
            {
                return Results.Json(new { success = false, message = "Підписка вже оформлена." });
            }

            // Оновлюємо статус підписки на 1 (оформлено)
            string updateQuery = "UPDATE users SET sub_status = 1 WHERE login = @login";
            using (SqlCommand updateCommand = new SqlCommand(updateQuery, connection))
            {
                updateCommand.Parameters.AddWithValue("@login", nickname);
                await updateCommand.ExecuteNonQueryAsync();
            }

            return Results.Json(new { success = true, message = "Підписка успішно оформлена!" });
        }
        catch (Exception ex)
        {
            return Results.Json(new { success = false, message = $"Помилка: {ex.Message}" });
        }
    }
});

app.MapPost("/get-user-info", async (HttpContext context) =>
{
    var body = await context.Request.ReadFromJsonAsync<Dictionary<string, string>>();
    if (body == null || !body.TryGetValue("nickname", out string nickname))
    {
        return Results.Json(new { success = false, message = "Неправильні дані." });
    }

    using (SqlConnection connection = new SqlConnection(connectionString))
    {
        try
        {
            await connection.OpenAsync();
            // Отримуємо статус підписки та улюблені книги
            string query = "SELECT sub_status, favorite_books FROM users WHERE login = @login";

            using (SqlCommand command = new SqlCommand(query, connection))
            {
                command.Parameters.AddWithValue("@login", nickname);
                using (SqlDataReader reader = await command.ExecuteReaderAsync())
                {
                    if (reader.Read())
                    {
                        bool subStatus = reader.GetBoolean(0);
                        try
                        {
                            string favoriteBooks = reader.GetString(1);
                            // Розбиваємо ID книг на масив
                            var bookIds = favoriteBooks.Split(',').Select(id => new { book_id = id }).ToList();
                            return Results.Json(new { success = true, sub_status = subStatus, favorite_books = bookIds });
                        }
                        catch
                        {
                            return Results.Json(new { success = true, sub_status = subStatus});
                        }
                    }
                    else
                    {
                        return Results.Json(new { success = false, message = "Користувача не знайдено." });
                    }
                }
            }
        }
        catch (Exception ex)
        {
            return Results.Json(new { success = false, message = $"Помилка: {ex.Message}" });
        }
    }
});
app.MapPost("/get-recommendations", async (HttpContext context) =>
{
    var body = await context.Request.ReadFromJsonAsync<Dictionary<string, string>>();
    if (body == null || !body.TryGetValue("nickname", out string nickname))
    {
        return Results.Json(new { success = false, message = "Неправильні дані." });
    }

    // Отримуємо улюблені книги користувача з бази даних
    using (SqlConnection connection = new SqlConnection(connectionString))
    {
        try
        {
            await connection.OpenAsync();
            string query = "SELECT favorite_books FROM users WHERE login = @login";
            string favoriteBooks = string.Empty;

            using (SqlCommand command = new SqlCommand(query, connection))
            {
                command.Parameters.AddWithValue("@login", nickname);
                var result = await command.ExecuteScalarAsync();
                favoriteBooks = result?.ToString();
            }

            if (string.IsNullOrEmpty(favoriteBooks))
            {
                return Results.Json(new { success = false, message = "Улюблені книги не знайдено." });
            }

            // Формуємо JSON для Flask
            var flaskRequest = new
            {
                favorites = favoriteBooks.Split(',').ToList() // Список ID улюблених книг
            };

            using (var httpClient = new HttpClient())
            {
                string flaskUrl = "http://127.0.0.1:5000/recommend"; // URL Flask-додатку

                var response = await httpClient.PostAsJsonAsync(flaskUrl, flaskRequest);
                if (response.IsSuccessStatusCode)
                {
                    var recommendations = await response.Content.ReadFromJsonAsync<object>();
                    return Results.Json(new { success = true, recommendations });
                }
                else
                {
                    return Results.Json(new { success = false, message = "Помилка на стороні Flask-сервера." });
                }
            }
        }
        catch (Exception ex)
        {
            return Results.Json(new { success = false, message = $"Помилка: {ex.Message}" });
        }
    }
});
app.Run();

// Допоміжні методи
static byte[] GenerateSalt()
{
    using (var rng = new RNGCryptoServiceProvider())
    {
        byte[] salt = new byte[16];
        rng.GetBytes(salt);
        return salt;
    }
}

static byte[] HashPassword(string password, byte[] salt)
{
    using (var pbkdf2 = new Rfc2898DeriveBytes(password, salt, 10000, HashAlgorithmName.SHA256))
    {
        return pbkdf2.GetBytes(32); // Отримуємо 32 байти хешу
    }
}
