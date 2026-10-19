import { ConnectedPosition, Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  ElementRef,
  HostBinding,
  OnDestroy,
  ViewContainerRef,
  effect,
  inject,
  input,
  model,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { ItskAlign } from '../../../common/model/itsk-align.enum';
import { BooleanFunc, BooleanPromiseFunc, boolFuncOrPromiseCallback } from '../../../util/object-util';
import { ItskDropdownContentDirective } from '../itsk-dropdown-content.directive';
import { ItskDropdownHeadDirective } from '../itsk-dropdown-head.directive';

@Component({
  selector: 'itsk-dropdown',
  templateUrl: './itsk-dropdown.component.html',
  styleUrls: ['./itsk-dropdown.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
})
export class ItskDropdownComponent implements OnDestroy {
  @HostBinding('class.dropdown') classDropdown = true;

  @ContentChild(ItskDropdownContentDirective, { static: true }) content?: ItskDropdownContentDirective;
  @ContentChild(ItskDropdownHeadDirective, { static: true }) head?: ItskDropdownHeadDirective;

  private readonly element$ = inject(ElementRef);
  private readonly overlay = inject(Overlay);
  private readonly viewContainerRef = inject(ViewContainerRef);

  align = input<ItskAlign.Left | ItskAlign.Right>(ItskAlign.Left);
  fixed = input(false);
  open = model(false);
  canOpen = input<boolean | BooleanFunc<void> | BooleanPromiseFunc<void>>(true);
  canClose = input<boolean | BooleanFunc<void> | BooleanPromiseFunc<void>>(true);
  autoClose = input(true);

  private overlayRef: OverlayRef | null = null;
  private detachSub?: Subscription;

  constructor() {
    effect(() => {
      if (this.open()) {
        this.createOverlay();
      } else {
        this.destroyOverlay();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyOverlay();
  }

  toggle(visible: boolean): void {
    if (visible) {
      boolFuncOrPromiseCallback(this.canOpen(), () => {
        this.open.set(true);
      })();
    } else {
      boolFuncOrPromiseCallback(this.canClose(), () => {
        this.open.set(false);
      })();
    }
  }

  private buildPositions(): ConnectedPosition[] {
    const isRight = this.align() === ItskAlign.Right;
    return [
      {
        originX: isRight ? 'end' : 'start',
        originY: 'bottom',
        overlayX: isRight ? 'end' : 'start',
        overlayY: 'top',
      },
      {
        originX: isRight ? 'end' : 'start',
        originY: 'top',
        overlayX: isRight ? 'end' : 'start',
        overlayY: 'bottom',
        panelClass: 'dropdown__content_top',
      },
    ];
  }

  private createOverlay(): void {
    if (this.overlayRef) {
      return;
    }

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(this.element$)
      .withPositions(this.buildPositions())
      .withPush(false);

    const scrollStrategy = this.autoClose() ? this.overlay.scrollStrategies.close() : this.overlay.scrollStrategies.reposition();

    const config = new OverlayConfig({
      positionStrategy,
      scrollStrategy,
      hasBackdrop: false,
      disposeOnNavigation: true,
      minWidth: this.element$.nativeElement.offsetWidth,
      panelClass: 'dropdown__content',
    });

    this.overlayRef = this.overlay.create(config);

    const portal = new TemplatePortal(this.content!.template, this.viewContainerRef);
    this.overlayRef.attach(portal);

    this.detachSub = this.overlayRef.detachments().subscribe(() => {
      if (this.open()) {
        this.destroyOverlay();
      }
    });

    if (this.autoClose()) {
      // overlayRef.backdropClick ложно срабатывает
      document.addEventListener('click', this.onDocumentClick, true);
    }
  }

  private onDocumentClick = (event: MouseEvent) => {
    const target = event.target as Node;
    const overlayEl = this.overlayRef?.overlayElement;
    const hostEl = this.element$.nativeElement;

    if (overlayEl && !overlayEl.contains(target) && !hostEl.contains(target)) {
      this.toggle(false);
    }
  };

  private destroyOverlay(): void {
    document.removeEventListener('click', this.onDocumentClick, true);

    this.detachSub?.unsubscribe();
    this.detachSub = undefined;

    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = null;
    }
  }
}
