FROM php:8.4-cli-alpine

RUN apk add --no-cache \
    git \
    unzip \
    postgresql-dev \
    $PHPIZE_DEPS \
    && docker-php-ext-install pdo_pgsql pgsql \
    && apk del $PHPIZE_DEPS

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

COPY composer.json composer.lock ./
RUN composer install --no-interaction --no-scripts --no-progress

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "composer install --no-interaction --no-progress && php artisan serve --host=0.0.0.0 --port=8000"]
