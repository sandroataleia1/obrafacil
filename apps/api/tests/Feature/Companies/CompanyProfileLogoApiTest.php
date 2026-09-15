<?php

namespace Tests\Feature\Companies;

use App\Enums\CompanyRole;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Feature\Companies\Concerns\InteractsWithCompanyProfile;
use Tests\TestCase;

/**
 * COMPANY-PROFILE-API-01: POST/DELETE /api/v1/company/profile/logo. CL1-CL12.
 *
 * Uses UploadedFile::fake()->create() (not ->image()) throughout — the
 * container has no GD extension installed, and ->create() with an
 * explicit mime type is sufficient to exercise both the `mimes` (claimed
 * extension) and `mimetypes` (Laravel reads the injected fake mime in
 * test mode) validation rules without needing a real rendered image.
 */
class CompanyProfileLogoApiTest extends TestCase
{
    use InteractsWithCompanyProfile, RefreshDatabase;

    private const ENDPOINT = '/api/v1/company/profile/logo';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function fakePng(string $name = 'logo.png', int $kilobytes = 50): UploadedFile
    {
        return UploadedFile::fake()->create($name, $kilobytes, 'image/png');
    }

    private function fakeJpeg(string $name = 'logo.jpg', int $kilobytes = 50): UploadedFile
    {
        return UploadedFile::fake()->create($name, $kilobytes, 'image/jpeg');
    }

    private function fakeWebp(string $name = 'logo.webp', int $kilobytes = 50): UploadedFile
    {
        return UploadedFile::fake()->create($name, $kilobytes, 'image/webp');
    }

    /** CL1: owner can upload. */
    public function test_cl1_owner_can_upload(): void
    {
        [$company] = $this->actingAsNewCompanyMember([], [], CompanyRole::Owner);

        $response = $this->post(self::ENDPOINT, ['logo' => $this->fakePng()]);

        $response->assertOk();
        $this->assertNotNull($company->refresh()->logo_path);
    }

    /** CL2: admin can upload. */
    public function test_cl2_admin_can_upload(): void
    {
        $this->actingAsNewCompanyMember([], [], CompanyRole::Admin);

        $this->post(self::ENDPOINT, ['logo' => $this->fakePng()])->assertOk();
    }

    /** CL3: plain member gets 403. */
    public function test_cl3_member_upload_is_rejected(): void
    {
        [$company] = $this->actingAsNewCompanyMember([], [], CompanyRole::Member);

        $response = $this->post(self::ENDPOINT, ['logo' => $this->fakePng()]);

        $response->assertStatus(403);
        $this->assertNull($company->refresh()->logo_path);
    }

    /** CL4: PNG accepted. */
    public function test_cl4_png_is_accepted(): void
    {
        $this->actingAsNewCompanyMember();

        $this->post(self::ENDPOINT, ['logo' => $this->fakePng()])->assertOk();
    }

    /** CL5: JPEG accepted. */
    public function test_cl5_jpeg_is_accepted(): void
    {
        $this->actingAsNewCompanyMember();

        $this->post(self::ENDPOINT, ['logo' => $this->fakeJpeg()])->assertOk();
    }

    /** CL6: WebP accepted. */
    public function test_cl6_webp_is_accepted(): void
    {
        $this->actingAsNewCompanyMember();

        $this->post(self::ENDPOINT, ['logo' => $this->fakeWebp()])->assertOk();
    }

    /** CL7: SVG rejected. */
    public function test_cl7_svg_is_rejected(): void
    {
        [$company] = $this->actingAsNewCompanyMember();

        $file = UploadedFile::fake()->create('logo.svg', 10, 'image/svg+xml');

        $response = $this->post(self::ENDPOINT, ['logo' => $file]);

        $response->assertStatus(422)->assertJsonValidationErrors(['logo']);
        $this->assertNull($company->refresh()->logo_path);
    }

    /** CL8: file over 2MB rejected. */
    public function test_cl8_oversized_file_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->post(self::ENDPOINT, ['logo' => $this->fakePng('logo.png', 2049)])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['logo']);
    }

    /** CL9: stored path is tenant-scoped (company id in the path) and not the original filename. */
    public function test_cl9_stored_path_is_tenant_scoped_and_unpredictable(): void
    {
        [$company] = $this->actingAsNewCompanyMember();

        $this->post(self::ENDPOINT, ['logo' => $this->fakePng('original-name.png')])->assertOk();

        $path = $company->refresh()->logo_path;

        $this->assertStringStartsWith("companies/{$company->id}/logos/", $path);
        $this->assertStringNotContainsString('original-name', $path);
        Storage::disk('public')->assertExists($path);
    }

    /** CL10: replacing a logo deletes the old file only after the new one is persisted successfully. */
    public function test_cl10_replace_deletes_old_only_after_success(): void
    {
        [$company] = $this->actingAsNewCompanyMember();

        $this->post(self::ENDPOINT, ['logo' => $this->fakePng('first.png')])->assertOk();
        $firstPath = $company->refresh()->logo_path;
        Storage::disk('public')->assertExists($firstPath);

        $this->post(self::ENDPOINT, ['logo' => $this->fakePng('second.png')])->assertOk();
        $secondPath = $company->refresh()->logo_path;

        $this->assertNotSame($firstPath, $secondPath);
        Storage::disk('public')->assertMissing($firstPath);
        Storage::disk('public')->assertExists($secondPath);
    }

    /** CL11: delete removes both the DB reference and the file, and is idempotent when there is no current logo. */
    public function test_cl11_delete_removes_db_reference_and_file(): void
    {
        [$company] = $this->actingAsNewCompanyMember();

        $this->post(self::ENDPOINT, ['logo' => $this->fakePng()])->assertOk();
        $path = $company->refresh()->logo_path;
        Storage::disk('public')->assertExists($path);

        $this->deleteJson(self::ENDPOINT)->assertOk()->assertJson(['logo_url' => null]);
        $this->assertNull($company->refresh()->logo_path);
        Storage::disk('public')->assertMissing($path);

        // Idempotent — deleting again with no current logo is not a 500.
        $this->deleteJson(self::ENDPOINT)->assertOk()->assertJson(['logo_url' => null]);
    }

    /** CL11b: only owner/admin can delete — plain member gets 403. */
    public function test_cl11b_member_delete_is_rejected(): void
    {
        $this->actingAsNewCompanyMember([], [], CompanyRole::Member);

        $this->deleteJson(self::ENDPOINT)->assertStatus(403);
    }

    /** CL12: the profile resource returns a derived logo_url (never logo_path) after upload. */
    public function test_cl12_resource_returns_logo_url(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->post(self::ENDPOINT, ['logo' => $this->fakePng()])->assertOk();

        $body = $response->json();
        $this->assertArrayNotHasKey('logo_path', $body);
        $this->assertNotNull($body['logo_url']);
        $this->assertIsString($body['logo_url']);
    }
}
