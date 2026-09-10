<?php

namespace Tests\Feature\Notifications;

use App\Notifications\Exceptions\WhatsAppClientException;
use App\Notifications\Exceptions\WhatsAppConnectionException;
use App\Notifications\Exceptions\WhatsAppInvalidResponseException;
use App\Notifications\Exceptions\WhatsAppServerException;
use App\Notifications\Exceptions\WhatsAppTimeoutException;
use App\Notifications\Providers\EvolutionApiProvider;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Every test here uses Http::fake() — no real request ever leaves this
 * process, and the fixture apikey/URL below are test-only values, never
 * printed in any assertion message or report (§38/§45).
 */
class EvolutionApiProviderTest extends TestCase
{
    private const FIXTURE_API_KEY = 'test-fixture-api-key-never-real';

    private function provider(int $timeoutSeconds = 10): EvolutionApiProvider
    {
        return new EvolutionApiProvider(
            baseUrl: 'https://evolution.test',
            apiKey: self::FIXTURE_API_KEY,
            instance: 'obrafacil-test',
            timeoutSeconds: $timeoutSeconds,
        );
    }

    public function test_sends_to_the_correct_url_with_apikey_header_and_correct_instance(): void
    {
        Http::fake([
            'evolution.test/*' => Http::response(['key' => ['id' => 'MSG1'], 'status' => 'PENDING'], 200),
        ]);

        $this->provider()->sendText('+5511999999999', 'Olá');

        Http::assertSent(function ($request) {
            return $request->url() === 'https://evolution.test/message/sendText/obrafacil-test'
                && $request->hasHeader('apikey', self::FIXTURE_API_KEY)
                && $request->method() === 'POST';
        });
    }

    public function test_normalizes_e164_phone_to_provider_number_format(): void
    {
        Http::fake([
            '*' => Http::response(['key' => ['id' => 'MSG1']], 200),
        ]);

        $this->provider()->sendText('+5511999999999', 'Olá');

        Http::assertSent(function ($request) {
            // E.164 with leading "+" -> Evolution's digits-only "number" field.
            return $request['number'] === '5511999999999';
        });
    }

    public function test_sends_the_text_body(): void
    {
        Http::fake(['*' => Http::response(['key' => ['id' => 'MSG1']], 200)]);

        $this->provider()->sendText('+5511999999999', 'Corpo da mensagem');

        Http::assertSent(fn ($request) => $request['text'] === 'Corpo da mensagem');
    }

    /**
     * Laravel's Http::fake() captures only the PSR-7 request, not the
     * client-level options (Request::options() doesn't exist), so the
     * configured timeout can't be asserted directly against a captured
     * request. What's actually verified: constructing the provider with a
     * different timeoutSeconds doesn't change behavior on a fast response
     * (no crash, no altered request shape) — the `->timeout()` call itself
     * is a one-line, directly-readable part of EvolutionApiProvider.
     */
    public function test_a_custom_timeout_configuration_does_not_alter_the_request_itself(): void
    {
        Http::fake(['*' => Http::response(['key' => ['id' => 'MSG1']], 200)]);

        $result = $this->provider(timeoutSeconds: 3)->sendText('+5511999999999', 'Olá');

        $this->assertTrue($result->accepted);
        Http::assertSent(fn ($request) => $request['number'] === '5511999999999');
    }

    public function test_2xx_response_is_parsed_into_an_accepted_result(): void
    {
        Http::fake([
            '*' => Http::response(['key' => ['id' => 'MSG-123'], 'status' => 'PENDING'], 200),
        ]);

        $result = $this->provider()->sendText('+5511999999999', 'Olá');

        $this->assertTrue($result->accepted);
        $this->assertSame('MSG-123', $result->providerMessageId);
        $this->assertSame('PENDING', $result->rawStatus);
    }

    public function test_4xx_response_throws_whatsapp_client_exception(): void
    {
        Http::fake(['*' => Http::response(['message' => 'Bad number'], 400)]);

        $this->expectException(WhatsAppClientException::class);

        $this->provider()->sendText('+5511999999999', 'Olá');
    }

    public function test_5xx_response_throws_whatsapp_server_exception(): void
    {
        Http::fake(['*' => Http::response(['message' => 'boom'], 503)]);

        $this->expectException(WhatsAppServerException::class);

        $this->provider()->sendText('+5511999999999', 'Olá');
    }

    public function test_timeout_throws_whatsapp_timeout_exception(): void
    {
        Http::fake([
            '*' => Http::failedConnection('cURL error 28: Operation timed out after 10000 milliseconds'),
        ]);

        $this->expectException(WhatsAppTimeoutException::class);

        $this->provider()->sendText('+5511999999999', 'Olá');
    }

    public function test_generic_network_failure_throws_whatsapp_connection_exception_not_timeout(): void
    {
        Http::fake([
            '*' => Http::failedConnection('cURL error 6: Could not resolve host: evolution.test'),
        ]);

        try {
            $this->provider()->sendText('+5511999999999', 'Olá');
            $this->fail('Expected an exception to be thrown.');
        } catch (WhatsAppConnectionException $e) {
            $this->assertNotInstanceOf(WhatsAppTimeoutException::class, $e);
        }
    }

    public function test_non_json_response_throws_whatsapp_invalid_response_exception(): void
    {
        Http::fake(['*' => Http::response('not json at all', 200)]);

        $this->expectException(WhatsAppInvalidResponseException::class);

        $this->provider()->sendText('+5511999999999', 'Olá');
    }

    public function test_the_api_key_fixture_never_appears_in_a_thrown_exceptions_message(): void
    {
        Http::fake(['*' => Http::response(['message' => 'boom'], 500)]);

        try {
            $this->provider()->sendText('+5511999999999', 'Olá');
        } catch (WhatsAppServerException $e) {
            $this->assertStringNotContainsString(self::FIXTURE_API_KEY, $e->getMessage());
        }
    }
}
