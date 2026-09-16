<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ListProjectRequest;
use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use App\Http\Resources\ProjectListResource;
use App\Http\Resources\ProjectResource;
use App\Models\Project;
use App\Projects\ProjectService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * PROJECT-API-01 §48-49. `{project}` is deliberately never implicit
 * route-model binding — same reasoning as CustomerController/
 * ServiceOrderController: SubstituteBindings runs before
 * `resolve-current-company` in this app's middleware priority. Every
 * lookup happens explicitly inside the action, after tenant context is
 * guaranteed, which also makes a cross-tenant id naturally 404 rather
 * than a 500 or a revealing 403.
 *
 * §47: no destroy() — there is no DELETE route in v1.
 */
class ProjectController extends Controller
{
    private const int DEFAULT_PER_PAGE = 15;

    private const int MAX_PER_PAGE = 100;

    public function __construct(private readonly ProjectService $service) {}

    public function index(ListProjectRequest $request): AnonymousResourceCollection
    {
        $perPage = min((int) $request->input('per_page', self::DEFAULT_PER_PAGE), self::MAX_PER_PAGE);
        $perPage = max($perPage, 1);

        $projects = Project::query()
            ->with(['customer', 'sourceBudget'])
            ->when($request->filled('search'), fn (Builder $query) => $this->applySearch($query, (string) $request->input('search')))
            ->when($request->filled('status'), fn (Builder $query) => $query->where('status', $request->input('status')))
            // §41: deterministic — most recently touched first, id as a
            // stable tiebreaker.
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->paginate($perPage)
            ->withQueryString();

        return ProjectListResource::collection($projects);
    }

    public function store(StoreProjectRequest $request): JsonResponse
    {
        $project = $this->service->create($request->validated());

        return (new ProjectResource($project))->response()->setStatusCode(201);
    }

    public function show(string $project): ProjectResource
    {
        $model = Project::query()->with(['customer', 'sourceBudget'])->findOrFail($project);

        return new ProjectResource($model);
    }

    public function update(UpdateProjectRequest $request, string $project): ProjectResource
    {
        // §49: findOrFail first so a cross-tenant/nonexistent id 404s
        // before any concurrency/relation logic ever runs.
        Project::query()->findOrFail($project);

        $model = $this->service->update($project, $request->validated());

        return new ProjectResource($model);
    }

    /**
     * §42: ILIKE across Project.name and the related Customer.name, never
     * a JOIN's worth of other fields (no address/Budget title/financeiro).
     * A term shaped like the human-facing "OBR-000001" is matched against
     * the real numeric `number` column exactly, never as a text substring.
     */
    private function applySearch(Builder $query, string $term): void
    {
        $numberFromFormatted = $this->extractNumberFromFormattedSearch($term);

        $query->where(function (Builder $inner) use ($term, $numberFromFormatted) {
            if ($numberFromFormatted !== null) {
                $inner->orWhere('number', $numberFromFormatted);
            } else {
                $inner->orWhereRaw('name ILIKE ?', ["%{$term}%"]);
            }

            $inner->orWhereHas('customer', function (Builder $customerQuery) use ($term) {
                $customerQuery->whereRaw('name ILIKE ?', ["%{$term}%"]);
            });
        });
    }

    private function extractNumberFromFormattedSearch(string $term): ?int
    {
        if (preg_match('/^OBR-?0*(\d+)$/i', trim($term), $matches) !== 1) {
            return null;
        }

        return (int) $matches[1];
    }
}
