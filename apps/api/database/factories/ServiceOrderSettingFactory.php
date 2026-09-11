<?php

namespace Database\Factories;

use App\Models\ServiceOrderSetting;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ServiceOrderSetting>
 *
 * company_id is never set here — forced by BelongsToCompany's creating
 * hook from the active CurrentCompanyContext.
 */
class ServiceOrderSettingFactory extends Factory
{
    protected $model = ServiceOrderSetting::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'default_travel_fee' => '0.00',
        ];
    }
}
