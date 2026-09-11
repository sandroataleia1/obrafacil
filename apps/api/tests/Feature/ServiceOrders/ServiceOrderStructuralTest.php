<?php

namespace Tests\Feature\ServiceOrders;

use App\Models\ServiceOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\Feature\ServiceOrders\Concerns\InteractsWithServiceOrders;
use Tests\TestCase;

/**
 * BACKEND-06 §2/§73/§83. Structural guarantees: ServiceOrder is
 * independent of Project (no column, no relation, no controller/service
 * reference), and there is no hard delete.
 */
class ServiceOrderStructuralTest extends TestCase
{
    use InteractsWithServiceOrders, RefreshDatabase;

    /** §73: the migration never created a project_id column. */
    public function test_service_orders_table_has_no_project_id_column(): void
    {
        $this->assertFalse(Schema::hasColumn('service_orders', 'project_id'));
    }

    /** §73: the Model has no Project relation method. */
    public function test_service_order_model_has_no_project_relation(): void
    {
        $this->assertFalse(method_exists(ServiceOrder::class, 'project'));
    }

    /**
     * §73: none of the ServiceOrder source files actually reference
     * `App\Models\Project` in code (a `use` import or a `Project::`/
     * `->project` code reference) — explanatory doc comments are allowed
     * to use the word "Project" in prose (e.g. explaining *why* there is
     * no coupling), so this only rejects real code coupling, not the word
     * itself appearing anywhere in the file.
     */
    public function test_service_order_source_never_references_project_class(): void
    {
        $files = [
            app_path('Models/ServiceOrder.php'),
            app_path('Models/ServiceOrderItem.php'),
            app_path('ServiceOrders/ServiceOrderService.php'),
            app_path('ServiceOrders/ServiceOrderItemService.php'),
            app_path('Http/Controllers/Api/V1/ServiceOrderController.php'),
            app_path('Http/Controllers/Api/V1/ServiceOrderItemController.php'),
            app_path('Http/Controllers/Api/V1/ServiceOrderStatusController.php'),
            app_path('Http/Requests/StoreServiceOrderRequest.php'),
            app_path('Http/Requests/UpdateServiceOrderRequest.php'),
        ];

        foreach ($files as $file) {
            $this->assertFileExists($file);
            $contents = file_get_contents($file);
            $this->assertStringNotContainsString('use App\\Models\\Project', $contents);
            $this->assertDoesNotMatchRegularExpression('/\bProject::/', $contents);
            $this->assertDoesNotMatchRegularExpression('/->project\s*\(/', $contents);
        }
    }

    /** §73/C21: a create request carrying project_id is a 422 prohibited. */
    public function test_create_with_project_id_is_prohibited(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();

        $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'project_id' => (string) Str::uuid(),
        ]))->assertStatus(422)->assertJsonValidationErrors(['project_id']);
    }

    /** §12/§83: DELETE /service-orders/{id} does not exist as a route. */
    public function test_no_delete_route_exists(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json('id');

        $response = $this->deleteJson("/api/v1/service-orders/{$orderId}");

        $this->assertContains($response->getStatusCode(), [404, 405]);
        $this->assertDatabaseHas('service_orders', ['id' => $orderId]);
    }

    /** §12: cancelling is the only "removal" — the row always remains. */
    public function test_cancel_never_deletes_the_row(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json('id');

        $this->postJson("/api/v1/service-orders/{$orderId}/cancel", ['reason' => 'Motivo qualquer'])->assertOk();

        $this->assertDatabaseHas('service_orders', ['id' => $orderId, 'status' => 'cancelled']);
    }

    /** §42: open/in_progress orders can have their header edited. */
    public function test_open_order_header_is_editable(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json('id');

        $this->putJson("/api/v1/service-orders/{$orderId}", $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'title' => 'Título atualizado',
        ]))->assertOk()->assertJson(['title' => 'Título atualizado']);
    }

    /** §41: a completed order's header cannot be edited (409). */
    public function test_completed_order_header_is_not_editable(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json('id');
        $this->postJson("/api/v1/service-orders/{$orderId}/complete")->assertOk();

        $this->putJson("/api/v1/service-orders/{$orderId}", $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'title' => 'Não deveria salvar',
        ]))->assertStatus(409);
    }

    /** §41: a cancelled order's header cannot be edited (409). */
    public function test_cancelled_order_header_is_not_editable(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json('id');
        $this->postJson("/api/v1/service-orders/{$orderId}/cancel", ['reason' => 'x'])->assertOk();

        $this->putJson("/api/v1/service-orders/{$orderId}", $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'title' => 'Não deveria salvar',
        ]))->assertStatus(409);
    }

    /** §39/§40: PUT never syncs items, but does re-copy the snapshot for a changed selection. */
    public function test_put_never_syncs_items_but_recopies_snapshot_on_change(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $catalogItem = $this->makeCatalogItem();
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'items' => [['catalog_item_id' => $catalogItem->id, 'quantity' => '1.000']],
        ]))->json('id');

        [$otherCustomer, $otherAddress] = $this->makeCustomerWithAddressAndContact(['name' => 'Outro Cliente']);
        $this->putJson("/api/v1/service-orders/{$orderId}", $this->validServiceOrderPayload([
            'customer_id' => $otherCustomer->id,
            'customer_address_id' => $otherAddress->id,
        ]))->assertOk()->assertJson(['customer' => ['name' => 'Outro Cliente']]);

        // items untouched by the header PUT.
        $this->getJson("/api/v1/service-orders/{$orderId}")->assertJsonCount(1, 'items');
    }

    /** §39: a non-empty `items` in the PUT payload is prohibited outright (never silently ignored). */
    public function test_put_with_items_key_is_prohibited(): void
    {
        $this->actingAsNewCompanyMember();
        [$customer, $address] = $this->makeCustomerWithAddressAndContact();
        $catalogItem = $this->makeCatalogItem();
        $orderId = $this->postJson('/api/v1/service-orders', $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
        ]))->json('id');

        $this->putJson("/api/v1/service-orders/{$orderId}", $this->validServiceOrderPayload([
            'customer_id' => $customer->id,
            'customer_address_id' => $address->id,
            'items' => [['catalog_item_id' => $catalogItem->id, 'quantity' => '1.000']],
        ]))->assertStatus(422)->assertJsonValidationErrors(['items']);
    }
}
