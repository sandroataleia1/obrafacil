<?php

namespace Database\Seeders;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed a minimal local-development company + admin user.
     *
     * Not a production/pilot fixture: credentials here are dev-only and
     * unrelated to any real client (e.g. JVW) login.
     */
    public function run(): void
    {
        $company = Company::factory()->create([
            'name' => 'Empresa Demo',
        ]);

        $user = User::factory()->create([
            'name' => 'Admin Demo',
            'email' => 'admin@demo.local',
        ]);

        $company->memberships()->create([
            'user_id' => $user->id,
            'role' => CompanyRole::Owner,
        ]);
    }
}
