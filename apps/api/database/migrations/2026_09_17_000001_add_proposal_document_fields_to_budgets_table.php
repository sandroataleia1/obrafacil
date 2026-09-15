<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * PROPOSAL-DOC-01A. `company_snapshot`/`proposal_logo_path`/
 * `proposal_template_version` are written ONLY by
 * `App\Budgets\BudgetService::submit()` — never mass-assigned from a
 * request (see Budget::$fillable, deliberately excludes these three).
 * `valid_until`/`payment_terms`/`execution_terms`/`proposal_terms` are
 * the new client-facing commercial-condition fields, editable only while
 * `status = draft` (same discipline as every other Budget header field).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('budgets', function (Blueprint $table) {
            $table->jsonb('company_snapshot')->nullable()->after('customer_email');
            $table->string('proposal_logo_path')->nullable()->after('company_snapshot');
            $table->smallInteger('proposal_template_version')->nullable()->after('proposal_logo_path');

            $table->date('valid_until')->nullable()->after('reference');
            $table->text('payment_terms')->nullable()->after('valid_until');
            $table->text('execution_terms')->nullable()->after('payment_terms');
            $table->text('proposal_terms')->nullable()->after('execution_terms');
        });
    }

    public function down(): void
    {
        Schema::table('budgets', function (Blueprint $table) {
            $table->dropColumn([
                'company_snapshot',
                'proposal_logo_path',
                'proposal_template_version',
                'valid_until',
                'payment_terms',
                'execution_terms',
                'proposal_terms',
            ]);
        });
    }
};
