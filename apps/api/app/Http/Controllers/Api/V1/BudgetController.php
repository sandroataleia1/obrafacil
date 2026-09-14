<?php

namespace App\Http\Controllers\Api\V1;

use App\Budgets\BudgetService;
use App\Http\Controllers\Controller;
use App\Http\Requests\ListBudgetRequest;
use App\Http\Requests\StoreBudgetRequest;
use App\Http\Requests\UpdateBudgetRequest;
use App\Http\Resources\BudgetListResource;
use App\Http\Resources\BudgetResource;
use App\Models\Budget;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * `{budget}` is deliberately never implicit route-model binding — same
 * reasoning as ServiceOrderController/CustomerController:
 * SubstituteBindings runs before `resolve-current-company` in this app's
 * middleware priority. Every lookup happens explicitly inside the
 * action, which also makes a cross-tenant id naturally 404.
 *
 * No destroy() — there is no DELETE /budgets/{id} route in this gate.
 */
class BudgetController extends Controller
{
    private const int DEFAULT_PER_PAGE = 15;

    private const int MAX_PER_PAGE = 100;

    public function __construct(private readonly BudgetService $service) {}

    public function index(ListBudgetRequest $request): AnonymousResourceCollection
    {
        $perPage = min((int) $request->input('per_page', self::DEFAULT_PER_PAGE), self::MAX_PER_PAGE);
        $perPage = max($perPage, 1);

        $budgets = Budget::query()
            ->when($request->filled('search'), fn (Builder $query) => $this->applySearch($query, (string) $request->input('search')))
            ->when($request->filled('status'), fn (Builder $query) => $query->where('status', $request->input('status')))
            ->when($request->filled('customer_id'), fn (Builder $query) => $query->where('customer_id', $request->input('customer_id')))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($perPage)
            ->withQueryString();

        return BudgetListResource::collection($budgets);
    }

    public function store(StoreBudgetRequest $request): JsonResponse
    {
        $budget = $this->service->create($request->validated(), $request->user());

        return (new BudgetResource($budget))->response()->setStatusCode(201);
    }

    public function show(string $budget): BudgetResource
    {
        $model = Budget::query()->with('items')->findOrFail($budget);

        return new BudgetResource($model);
    }

    public function update(UpdateBudgetRequest $request, string $budget): BudgetResource
    {
        $model = Budget::query()->findOrFail($budget);
        $model = $this->service->updateHeader($model, $request->validated());

        return new BudgetResource($model->load('items'));
    }

    /**
     * ILIKE across number (cast to text), title, reference, and the
     * customer_name snapshot — never a JOIN. A term shaped like the
     * human-facing "ORC-000001" is matched against the real numeric
     * `number` column exactly.
     */
    private function applySearch(Builder $query, string $term): void
    {
        $numberFromFormatted = $this->extractNumberFromFormattedSearch($term);

        $query->where(function (Builder $inner) use ($term, $numberFromFormatted) {
            if ($numberFromFormatted !== null) {
                $inner->orWhere('number', $numberFromFormatted);
            } else {
                $inner->orWhereRaw('CAST(number AS TEXT) ILIKE ?', ["%{$term}%"]);
            }

            $inner->orWhereRaw('title ILIKE ?', ["%{$term}%"])
                ->orWhereRaw('reference ILIKE ?', ["%{$term}%"])
                ->orWhereRaw('customer_name ILIKE ?', ["%{$term}%"]);
        });
    }

    private function extractNumberFromFormattedSearch(string $term): ?int
    {
        if (preg_match('/^ORC-?0*(\d+)$/i', trim($term), $matches) !== 1) {
            return null;
        }

        return (int) $matches[1];
    }
}
