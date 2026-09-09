<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Rules\E164Phone;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

class PhoneTest extends TestCase
{
    use RefreshDatabase;

    /** A8: A canonical E.164 phone is accepted and persisted as-is. */
    public function test_user_phone_accepts_e164_format(): void
    {
        $user = User::factory()->create(['phone' => '+5511999999999']);

        $this->assertSame('+5511999999999', $user->fresh()->phone);
    }

    /**
     * A9: A non-canonical phone is rejected at the write point.
     *
     * There's no HTTP endpoint that writes `phone` yet this round (no
     * registration/profile-update route exists), so the appropriate write
     * point right now is the database itself: the `users_phone_e164_check`
     * constraint added in the same migration that created the column is
     * what actually guarantees no invalid value can ever be persisted,
     * regardless of which future code path writes to it.
     */
    public function test_non_canonical_phone_is_rejected_by_the_database_constraint(): void
    {
        $this->expectException(QueryException::class);

        User::factory()->create(['phone' => '(11) 99999-9999']);
    }

    /** The reusable E164Phone validation rule (for a future write endpoint) rejects non-canonical input. */
    public function test_e164_phone_rule_rejects_non_canonical_formats(): void
    {
        $invalid = ['(11) 99999-9999', '11999999999', '+55 11 99999-9999', '++5511999999999'];

        foreach ($invalid as $value) {
            $validator = Validator::make(['phone' => $value], ['phone' => [new E164Phone]]);
            $this->assertTrue($validator->fails(), "Expected '{$value}' to fail E164Phone validation.");
        }

        $validator = Validator::make(['phone' => '+5511999999999'], ['phone' => [new E164Phone]]);
        $this->assertFalse($validator->fails());
    }

    /**
     * Non-implicit rules (E164Phone isn't an ImplicitRule) are correctly
     * skipped by Laravel's validator when the field is empty/absent —
     * exactly the semantics we want for a nullable phone: "not provided" is
     * valid, only a provided-but-malformed value should fail.
     */
    public function test_e164_phone_rule_does_not_reject_an_absent_value(): void
    {
        $validator = Validator::make(['phone' => ''], ['phone' => ['nullable', new E164Phone]]);

        $this->assertFalse($validator->fails());
    }
}
