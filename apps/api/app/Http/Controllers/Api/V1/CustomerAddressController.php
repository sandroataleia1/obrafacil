<?php

namespace App\Http\Controllers\Api\V1;

use App\Customers\CustomerAddressService;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCustomerAddressRequest;
use App\Http\Requests\UpdateCustomerAddressRequest;
use App\Http\Resources\CustomerAddressResource;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * Nested under /customers/{customer}/addresses. Neither `{customer}` nor
 * `{address}` are ever type-hinted as a model (see CustomerController's
 * docblock for why `{customer}` can't be implicit here). `{address}` is
 * resolved via `$customer->addresses()->findOrFail()` so a cross-customer
 * address id (§35/D12) throws ModelNotFoundException -> a real 404,
 * indistinguishable from "address doesn't exist at all", never an
 * edit/delete of another customer's row.
 */
class CustomerAddressController extends Controller
{
    public function __construct(private readonly CustomerAddressService $service) {}

    public function store(StoreCustomerAddressRequest $request, string $customer): JsonResponse
    {
        $customerModel = Customer::query()->findOrFail($customer);
        $address = $this->service->create($customerModel, $request->validated());

        return (new CustomerAddressResource($address))->response()->setStatusCode(201);
    }

    public function update(UpdateCustomerAddressRequest $request, string $customer, string $address): CustomerAddressResource
    {
        $customerModel = Customer::query()->findOrFail($customer);
        $addressModel = $customerModel->addresses()->findOrFail($address);
        $addressModel = $this->service->update($customerModel, $addressModel, $request->validated());

        return new CustomerAddressResource($addressModel);
    }

    public function destroy(string $customer, string $address): Response
    {
        $customerModel = Customer::query()->findOrFail($customer);
        $addressModel = $customerModel->addresses()->findOrFail($address);
        $this->service->delete($customerModel, $addressModel);

        return response()->noContent();
    }
}
