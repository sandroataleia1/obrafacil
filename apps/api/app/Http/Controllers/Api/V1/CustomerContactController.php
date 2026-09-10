<?php

namespace App\Http\Controllers\Api\V1;

use App\Customers\CustomerContactService;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCustomerContactRequest;
use App\Http\Requests\UpdateCustomerContactRequest;
use App\Http\Resources\CustomerContactResource;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * Nested under /customers/{customer}/contacts — same cross-customer
 * protection rationale as CustomerAddressController (§81/D12/KC12), and
 * the same reason `{customer}`/`{contact}` are never implicit bindings
 * (see CustomerController's docblock).
 */
class CustomerContactController extends Controller
{
    public function __construct(private readonly CustomerContactService $service) {}

    public function store(StoreCustomerContactRequest $request, string $customer): JsonResponse
    {
        $customerModel = Customer::query()->findOrFail($customer);
        $contact = $this->service->create($customerModel, $request->validated());

        return (new CustomerContactResource($contact))->response()->setStatusCode(201);
    }

    public function update(UpdateCustomerContactRequest $request, string $customer, string $contact): CustomerContactResource
    {
        $customerModel = Customer::query()->findOrFail($customer);
        $contactModel = $customerModel->contacts()->findOrFail($contact);
        $contactModel = $this->service->update($customerModel, $contactModel, $request->validated());

        return new CustomerContactResource($contactModel);
    }

    public function destroy(string $customer, string $contact): Response
    {
        $customerModel = Customer::query()->findOrFail($customer);
        $contactModel = $customerModel->contacts()->findOrFail($contact);
        $this->service->delete($customerModel, $contactModel);

        return response()->noContent();
    }
}
