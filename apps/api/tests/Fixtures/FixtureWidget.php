<?php

namespace Tests\Fixtures;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Minimal tenant-scoped model, used only by tests to prove
 * BelongsToCompany/CompanyScope behavior in isolation from any real
 * business domain.
 */
class FixtureWidget extends Model
{
    use BelongsToCompany, HasUuids;

    protected $table = 'fixture_widgets';

    protected $fillable = ['name'];
}
