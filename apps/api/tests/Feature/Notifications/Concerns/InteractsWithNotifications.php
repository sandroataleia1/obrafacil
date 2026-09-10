<?php

namespace Tests\Feature\Notifications\Concerns;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\NotificationPreference;
use App\Models\NotificationSetting;
use App\Models\User;
use App\Notifications\Contracts\WhatsAppProvider;
use App\Notifications\Providers\FakeWhatsAppProvider;
use App\Notifications\Support\NotificationChannel;
use App\Notifications\Support\NotificationEventType;
use App\Support\CurrentCompanyContext;

trait InteractsWithNotifications
{
    protected function currentCompanyContext(): CurrentCompanyContext
    {
        return app(CurrentCompanyContext::class);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    protected function makeCompanyWithMember(array $companyAttributes = [], array $userAttributes = []): array
    {
        $company = Company::factory()->create($companyAttributes);
        $user = User::factory()->create($userAttributes);
        $company->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        return [$company, $user];
    }

    /**
     * Grants a user full eligibility for one event type: whatsapp enabled
     * at the settings level AND an explicit enabled preference for that
     * event type — both are required (§27).
     */
    protected function enableWhatsAppFor(
        Company $company,
        User $user,
        NotificationEventType $type = NotificationEventType::SystemTest,
        bool $quietHoursEnabled = false,
    ): void {
        $this->currentCompanyContext()->run($company, function () use ($user, $type, $quietHoursEnabled) {
            NotificationSetting::factory()->create([
                'user_id' => $user->id,
                'whatsapp_enabled' => true,
                'quiet_hours_enabled' => $quietHoursEnabled,
            ]);
            NotificationPreference::factory()->create([
                'user_id' => $user->id,
                'event_type' => $type,
                'channel' => NotificationChannel::WhatsApp,
                'enabled' => true,
            ]);
        });
    }

    protected function bindFakeWhatsAppProvider(): FakeWhatsAppProvider
    {
        $fake = new FakeWhatsAppProvider;
        $this->app->instance(WhatsAppProvider::class, $fake);

        return $fake;
    }
}
