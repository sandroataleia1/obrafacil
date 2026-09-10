<?php

namespace App\Http\Controllers\Api\V1;

use App\Customers\CustomerService;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCustomerRequest;
use App\Http\Requests\UpdateCustomerRequest;
use App\Http\Resources\CustomerListResource;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use App\Support\Document;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * Controller stays thin (§51) — every real decision (atomicity, primary
 * address/contact invariants) lives in App\Customers\*Service.
 *
 * `{customer}` is deliberately NEVER an implicit route-model-binding
 * (`Customer $customer` in a method signature) — Laravel's
 * SubstituteBindings middleware, per its position in the framework's
 * default $middlewarePriority, resolves route-model bindings *before*
 * this app's own `resolve-current-company` middleware (an alias unknown
 * to that priority list) ever runs. A tenant-scoped implicit binding
 * would therefore try to query Customer before CurrentCompanyContext is
 * set, throwing instead of ever reaching a controller action. Every
 * lookup here happens explicitly, inside the action, after tenant context
 * is guaranteed to exist — which is also what makes a cross-tenant id
 * naturally 404 (CompanyScope simply never finds the row) rather than a
 * 500.
 */
class CustomerController extends Controller
{
    private const int DEFAULT_PER_PAGE = 15;

    private const int MAX_PER_PAGE = 100;

    public function __construct(private readonly CustomerService $service) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $perPage = min((int) $request->input('per_page', self::DEFAULT_PER_PAGE), self::MAX_PER_PAGE);
        $perPage = max($perPage, 1);

        $customers = Customer::query()
            ->when($request->filled('search'), fn (Builder $query) => $this->applySearch($query, (string) $request->input('search')))
            ->with([
                'addresses' => fn ($query) => $query->where('is_primary', true),
                'contacts' => fn ($query) => $query->where('is_primary', true),
            ])
            ->orderBy('name')
            ->orderBy('id')
            ->paginate($perPage)
            ->withQueryString();

        return CustomerListResource::collection($customers);
    }

    public function store(StoreCustomerRequest $request): JsonResponse
    {
        $customer = $this->service->create($request->validated());

        return (new CustomerResource($customer))->response()->setStatusCode(201);
    }

    public function show(string $customer): CustomerResource
    {
        $model = Customer::query()->findOrFail($customer);
        $model->load([
            'addresses' => fn ($query) => $query->orderByDesc('is_primary')->orderBy('label')->orderBy('id'),
            'contacts' => fn ($query) => $query->orderByDesc('is_primary')->orderByDesc('active')->orderBy('name')->orderBy('id'),
        ]);

        return new CustomerResource($model);
    }

    public function update(UpdateCustomerRequest $request, string $customer): CustomerResource
    {
        $model = Customer::query()->findOrFail($customer);
        $model = $this->service->update($model, $request->validated());

        return new CustomerResource($model);
    }

    public function destroy(string $customer): Response
    {
        $model = Customer::query()->findOrFail($customer);
        $model->delete();

        return response()->noContent();
    }

    private function applySearch(Builder $query, string $term): void
    {
        $digits = Document::digitsOnly($term) ?? '';

        $query->where(function (Builder $inner) use ($term, $digits) {
            $inner->whereRaw('name ILIKE ?', ["%{$term}%"])
                ->orWhereRaw('legal_name ILIKE ?', ["%{$term}%"])
                ->orWhereRaw('trade_name ILIKE ?', ["%{$term}%"])
                ->orWhereRaw('email ILIKE ?', ["%{$term}%"]);

            if ($digits !== '') {
                $inner->orWhereRaw("regexp_replace(document, '\\D', '', 'g') LIKE ?", ["%{$digits}%"])
                    ->orWhereRaw("regexp_replace(phone, '\\D', '', 'g') LIKE ?", ["%{$digits}%"]);
            }

            // §91: a customer is also findable by one of its contacts —
            // via EXISTS, never a JOIN (which would duplicate the
            // customer row per matching contact and break pagination).
            $inner->orWhereExists(function ($sub) use ($term, $digits) {
                $sub->selectRaw('1')
                    ->from('customer_contacts')
                    ->whereColumn('customer_contacts.customer_id', 'customers.id')
                    ->where(function ($contactQuery) use ($term, $digits) {
                        $contactQuery->whereRaw('customer_contacts.name ILIKE ?', ["%{$term}%"])
                            ->orWhereRaw('customer_contacts.email ILIKE ?', ["%{$term}%"]);
                        if ($digits !== '') {
                            $contactQuery
                                ->orWhereRaw("regexp_replace(customer_contacts.phone, '\\D', '', 'g') LIKE ?", ["%{$digits}%"])
                                ->orWhereRaw("regexp_replace(customer_contacts.whatsapp, '\\D', '', 'g') LIKE ?", ["%{$digits}%"]);
                        }
                    });
            });
        });
    }
}
