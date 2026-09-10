<?php

namespace App\Http\Requests;

use App\Notifications\Settings\NotificationSettingsService;
use App\Rules\E164Phone;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * PUT /api/v1/notifications/settings — the payload is always a complete
 * snapshot of the user's own configuration for the active company (§19).
 * There is deliberately no user_id/company_id/channel/provider/timezone/
 * recipient_phone in the payload — those are either implicit (the
 * authenticated user + resolved company) or read-only elsewhere (§3/§11/
 * §12), and are rejected outright (`prohibited`, §25) rather than silently
 * ignored, so a client sending them gets a clear signal instead of a
 * silent no-op.
 */
class NotificationSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $configurableEventTypeValues = array_map(
            fn ($type) => $type->value,
            app(NotificationSettingsService::class)->configurableEventTypes(),
        );

        return [
            // Hostile/foreign fields (§25) — never silently dropped.
            'company_id' => ['prohibited'],
            'user_id' => ['prohibited'],
            'channel' => ['prohibited'],
            'provider' => ['prohibited'],
            'timezone' => ['prohibited'],
            'recipient_phone' => ['prohibited'],

            'whatsapp_enabled' => ['required', 'boolean'],

            'quiet_hours_enabled' => ['required', 'boolean'],
            'quiet_start' => ['required_if:quiet_hours_enabled,true', 'nullable', 'date_format:H:i'],
            'quiet_end' => ['required_if:quiet_hours_enabled,true', 'nullable', 'date_format:H:i'],

            'daily_summary_enabled' => ['required', 'boolean'],
            'daily_summary_time' => ['required_if:daily_summary_enabled,true', 'nullable', 'date_format:H:i'],

            'weekly_summary_enabled' => ['required', 'boolean'],
            'weekly_summary_day' => ['required_if:weekly_summary_enabled,true', 'nullable', 'integer', 'between:1,7'],
            'weekly_summary_time' => ['required_if:weekly_summary_enabled,true', 'nullable', 'date_format:H:i'],

            'preferences' => ['present', 'array'],
            'preferences.*.event_type' => [
                'required',
                'string',
                'distinct',
                Rule::in($configurableEventTypeValues),
            ],
            'preferences.*.enabled' => ['required', 'boolean'],
        ];
    }

    public function withValidator(ValidatorContract $validator): void
    {
        $validator->after(function (ValidatorContract $validator) {
            $this->validateQuietHoursWindow($validator);
            $this->validateWhatsappRequiresPhone($validator);
        });
    }

    private function validateQuietHoursWindow(ValidatorContract $validator): void
    {
        if (! $this->boolean('quiet_hours_enabled')) {
            return;
        }

        $start = $this->input('quiet_start');
        $end = $this->input('quiet_end');

        // §10: start == end is semantically ambiguous (24h silent vs. no
        // silent period at all) — rejected outright rather than guessing.
        if ($start !== null && $end !== null && $start === $end) {
            $validator->errors()->add('quiet_start', 'The quiet hours window cannot start and end at the same time.');
        }
    }

    private function validateWhatsappRequiresPhone(ValidatorContract $validator): void
    {
        if (! $this->boolean('whatsapp_enabled')) {
            return;
        }

        $phone = $this->user()?->phone;
        $phoneValidator = validator(['phone' => $phone], ['phone' => ['required', new E164Phone]]);

        if ($phoneValidator->fails()) {
            $validator->errors()->add(
                'whatsapp_enabled',
                'WhatsApp cannot be enabled without a valid phone number on file.'
            );
        }
    }
}
