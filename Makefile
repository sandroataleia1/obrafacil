.PHONY: up down logs restart build test test-api lint lint-web typecheck-web sh-api sh-web migrate

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart

build:
	docker compose build

logs:
	docker compose logs -f

test: test-api

test-api:
	docker compose exec api php artisan test

lint: lint-web

lint-web:
	docker compose exec web pnpm lint

typecheck-web:
	docker compose exec web pnpm typecheck

migrate:
	docker compose exec api php artisan migrate

sh-api:
	docker compose exec api sh

sh-web:
	docker compose exec web sh
