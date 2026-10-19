import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChild,
  ElementRef,
  HostBinding,
  HostListener,
  Input,
  OnInit,
  TemplateRef,
  ViewChild,
  forwardRef,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ItskDropdownContentDirective } from '../../itsk-dropdown/itsk-dropdown-content.directive';
import { ItskDropdownHeadDirective } from '../../itsk-dropdown/itsk-dropdown-head.directive';
import { ItskDropdownComponent } from '../../itsk-dropdown/itsk-dropdown/itsk-dropdown.component';
import { ItskIconComponent } from '../../itsk-icon/itsk-icon/itsk-icon.component';
import { AnyObject } from '../../itsk-shared/any-object';
import { ItskMarkDirective } from '../../itsk-shared/itsk-mark.directive';
import { ItskTreeItemComponent } from '../../itsk-tree/itsk-tree-item/itsk-tree-item.component';
import { ItskTreeTemplateDirective } from '../../itsk-tree/itsk-tree-template.directive';
import { ItskTreeComponent } from '../../itsk-tree/itsk-tree/itsk-tree.component';
import { IItskTreeItem } from '../../itsk-tree/model/i-itsk-tree-item';
import { ItskTreeControl } from '../../itsk-tree/model/itsk-tree-control';
import { ItskTreeSelectOptionDirective } from '../directive/itsk-tree-select-option.directive';
import { ItskTreeSelectValueDirective } from '../directive/itsk-tree-select-value.directive';

enum ViewType {
  inline,
  inlineMulti,
  block,
  template,
  templateMulti,
  notSelected,
  notSelectedTemplate,
}

export interface TreeSelectItem extends IItskTreeItem {
  [key: string]: any;

  children?: TreeSelectItem[];
}

@Component({
  selector: 'itsk-tree-select',
  templateUrl: './itsk-tree-select.component.html',
  styleUrls: ['./itsk-tree-select.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ItskTreeSelectComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ItskDropdownComponent,
    ItskDropdownHeadDirective,
    NgTemplateOutlet,
    ItskIconComponent,
    ItskDropdownContentDirective,
    FormsModule,
    ItskTreeComponent,
    ItskTreeTemplateDirective,
    ItskTreeItemComponent,
    ItskMarkDirective,
  ],
})
export class ItskTreeSelectComponent implements ControlValueAccessor, OnInit {
  private searchTextSub = new Subject<string | null | undefined>();
  private searchTextSubscription?: Subscription;
  private $searchText: string | null | undefined;
  private rawNgModel: TreeSelectItem | TreeSelectItem[] | undefined;
  viewTypeEnum = ViewType;
  selectedItem: TreeSelectItem | TreeSelectItem[] | undefined;
  focusedIndex: number | null = null;
  focused = false;
  itemsCount = 0;
  treeControl?: ItskTreeControl;
  private started = false;
  hiddenItems: Set<TreeSelectItem> = new Set();

  /** Максимальная высота области прокрутки */
  @Input() height = '40vh';

  @ViewChild('searchInput', { static: false }) private searchInput$?: ElementRef<HTMLInputElement>;
  @ViewChild(CdkVirtualScrollViewport, { static: false }) private virtualViewport$?: CdkVirtualScrollViewport;

  @ContentChild(ItskTreeSelectValueDirective, { static: true }) valueTemplate?: ItskTreeSelectValueDirective;
  @ContentChild(ItskTreeSelectOptionDirective, { static: true }) optionTemplate?: ItskTreeSelectOptionDirective;

  //#region Inputs

  @HostBinding('tabindex') tabindex = 0;

  @HostBinding('class.select') selectClass = true;

  /** Высота в `px` элемента выпадающего списка */
  @Input() itemSize = 32;

  @Input() fixed = false;

  /** Не скрывать выпадашку при расфокусировке */
  @Input() debug = false;

  /** Можно ли выбирать группы */
  @Input() groupsSelectable = false;

  @Input() set panelOpen(val) {
    if (val) {
      this.open();
    } else {
      this.close();
    }
  }

  get panelOpen() {
    return this.$panelOpen;
  }

  private $panelOpen = false;

  /** Возможность стереть значение(я) */
  @Input() showClearButton = false;

  /** Если false, группы с пустым массивом children не будут считаться группами */
  // note: обратная совместимость с обычным форматом дерева
  @Input() groupsCanHaveNoChildren = true;

  /** Поиск по элементам */
  @Input() searchRef?: string | ((item: TreeSelectItem) => string);

  /** Шаблон или текст выводящийся если нет выбранных, по умолчанию пустая строка */
  @Input() placeholder?: string | TemplateRef<void>;

  /** Для отображения выделенного */
  @Input() selectedRef?: TemplateRef<{ item: TreeSelectItem }> | 'block';

  /** Шаблон для отображения */
  @Input() set textRef(val: TemplateRef<{ item: TreeSelectItem }> | string) {
    if (val instanceof TemplateRef) {
      this.textTemplate = val;
    }
    if (typeof val === 'string') {
      this.textPath = val;
    }
  }

  textTemplate?: TemplateRef<{ item: TreeSelectItem }>;
  private textPath?: string;

  /** Шаблон для отображения групп */
  @Input() set groupItemRef(val: TemplateRef<{ item: TreeSelectItem; expanded: boolean }> | string) {
    if (val instanceof TemplateRef) {
      this.groupTemplate = val;
    }
    if (typeof val === 'string') {
      this.groupPath = val;
    }
  }

  groupTemplate?: TemplateRef<{ item: TreeSelectItem; expanded: boolean }>;
  private groupPath?: string;

  /** Доступность селекта, по умолчанию `false` */
  @HostBinding('class.select_disabled')
  @Input()
  set disabled(value: boolean) {
    this.$disabled = value;
    this.close();
  }

  get disabled() {
    return this.$disabled;
  }

  private $disabled = false;

  /** Возможность множественного выбора, по умолчанию `false` */
  @HostBinding('class.select_multiple')
  @Input()
  set multiple(value: boolean) {
    if (this.$multiple !== value) {
      if (this.started) {
        throw new Error('Нельзя менять режим `multiple` после инициализации');
      }
      this.$multiple = value;
      if (this.multiple) {
        this.selectedItem = [];
      }
    }
  }

  get multiple() {
    return this.$multiple;
  }

  private $multiple = false;

  /** Данные для отображения */
  @Input() set items(val: TreeSelectItem[]) {
    this.$items = val;
    this.flatItems = val.map((v) => this.flat(v)).reduce((acc, v) => acc.concat(v), []); // .flat();
    this.flatDeepestItems = val.map((v) => this.flatNoParent(v)).reduce((acc, v) => acc.concat(v), []); // .flat();
    this.treeControl = new ItskTreeControl(this.$items, this.$panelOpen);
    this.itemsCount = val ? this.filteredFlatSelectableItems.length : 0;
    this.$searchText = null;
    this.writeValue(this.rawNgModel);
  }

  get items() {
    return this.$items ?? [];
  }

  get filteredFlatItems() {
    if (!this.treeControl) {
      return [];
    }
    const temp: Set<TreeSelectItem> = new Set();
    return this.flatItems.filter((i) => {
      const result = !this.hiddenItems.has(i[0]) && (!i[1] || (this.treeControl?.isExpanded(i[1]) && temp.has(i[1])));
      if (result) {
        temp.add(i[0]);
      }
      return result;
    });
  }

  get filteredFlatSelectableItems() {
    if (!this.groupsSelectable) {
      return this.filteredFlatDeepestItems;
    }
    return this.filteredFlatItems;
  }

  get filteredFlatDeepestItems() {
    const temp = this.filteredFlatItems.map((v) => v[0]);
    return this.flatDeepestItems.filter((v) => temp.includes(v[0]));
  }

  get focusedItem() {
    if (this.focusedIndex === null) {
      return undefined;
    }
    return this.filteredFlatItems[this.focusedIndex][0];
  }

  private flatItems: [TreeSelectItem, TreeSelectItem?][] = [];
  private flatDeepestItems: [TreeSelectItem, TreeSelectItem?][] = [];
  private $items?: TreeSelectItem[];

  /** Геттер значения объекта */
  @Input() set valueRef(value: ((item?: TreeSelectItem) => any) | string) {
    switch (typeof value) {
      case 'string':
        this.$valueRef = (item) => this.fetchFromObject(item, value);
        break;
      case 'function':
        this.$valueRef = value;
        break;
      default:
        throw new Error('Неподдерживаемый тип');
    }
  }

  private $valueRef = (item?: TreeSelectItem) => item;

  //#endregion

  //#region Props

  get hasSearch() {
    return !!this.searchRef;
  }

  set searchText(value: string | null | undefined) {
    this.searchTextSub.next(value);
  }

  get searchText() {
    return this.$searchText;
  }

  get hasValue() {
    return this.multiple ? this.selectedItem?.length > 0 : this.selectedItem !== null && typeof this.selectedItem !== 'undefined';
  }

  get searchFocused() {
    return this.hasSearch && this.searchInput$?.nativeElement === document.activeElement;
  }

  get performedSearch() {
    return this.hasSearch && this.$searchText;
  }

  //#endregion

  //#region Angular

  constructor(
    private changeDetector: ChangeDetectorRef,
    public elementRef: ElementRef,
  ) {}

  ngOnInit() {
    this.started = true;
  }

  private forceChange() {
    this.$items = this.items.concat();
  }

  //#endregion

  //#region ControlValueAccessor

  /** Writes a new value to the element. */
  writeValue(obj?: any | any[]): void {
    this.rawNgModel = obj;
    if (this.multiple) {
      this.selectedItem =
        obj && this.items
          ? Array.from(obj)
              .map((objItem) => this.find({ children: this.items }, objItem))
              .filter((item) => item)
          : [];
    } else {
      this.selectedItem = this.items && this.find({ children: this.items }, obj);
    }
    this.changeDetector.markForCheck();
  }

  private find(item: any, obj: any) {
    return this.$valueRef(item) === obj ? item : item.children?.reduce((result: any, n: any) => result || this.find(n, obj), undefined);
  }

  /** Model callback вызовется когда модель измениться из ui */
  onChange: (value?: TreeSelectItem) => void = () => {};

  /** Registers a callback function that should be called when the control's value changes in the UI */
  registerOnChange(fn: (value?: TreeSelectItem) => void): void {
    this.onChange = fn;
  }

  onTouched = () => {};

  /** Registers a callback function that should be called when the control receives a blur event. */
  registerOnTouched(fn: () => {}): void {
    this.onTouched = fn;
  }

  /** This function is called by the forms API when the control status changes to or from "DISABLED". */
  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.changeDetector.markForCheck();
  }

  //#endregion

  //#region Открытие, закрытие

  toggle() {
    this.panelOpen ? this.close() : this.open();
  }

  open() {
    if (this.disabled) {
      return;
    }
    if (this.panelOpen) {
      return;
    }
    this.$panelOpen = true;
    this.changeDetector.markForCheck();
    if (this.hasSearch) {
      this.searchTextSubscription = this.searchTextSub.pipe(debounceTime(300)).subscribe((text) => this.search(text as string));

      setTimeout(() => {
        this.searchInput$?.nativeElement.focus();
      }, 0);
    }
  }

  close() {
    // if (this.alwaysOpen) {
    //   return;
    // }
    if (this.panelOpen) {
      this.$panelOpen = false;
      this.focusedIndex = null;
      this.changeDetector.markForCheck();
      if (this.hasSearch) {
        this.elementRef.nativeElement.focus();
      }
      if (this.searchTextSubscription) {
        this.searchTextSubscription.unsubscribe();
        this.searchTextSubscription = undefined;
      }
    }
  }

  //#endregion

  //#region Отображение

  getText(item: TreeSelectItem) {
    return this.textPath ? this.fetchFromObject(item, this.textPath) : item;
  }

  getInlineMulti() {
    return this.selectedItem?.map((s: TreeSelectItem) => this.getText(s));
  }

  private fetchFromObject(obj: AnyObject | undefined, prop: string): any {
    if (typeof obj === 'undefined') {
      return null;
    }

    const index = prop.indexOf('.');
    if (index > -1) {
      return this.fetchFromObject(obj[prop.substring(0, index)], prop.substr(index + 1));
    }

    return obj[prop];
  }

  get viewType() {
    if (!this.hasValue) {
      return this.placeholder instanceof TemplateRef ? ViewType.notSelectedTemplate : ViewType.notSelected;
    }

    if (this.multiple) {
      if (this.selectedRef === 'block') {
        return ViewType.block;
      }

      if (this.selectedRef instanceof TemplateRef) {
        return ViewType.templateMulti;
      }

      return ViewType.inlineMulti;
    } else {
      if (this.selectedRef instanceof TemplateRef) {
        return ViewType.template;
      }

      return ViewType.inline;
    }
  }

  //#endregion

  //#region Дерево

  hasChildren(item: TreeSelectItem): boolean {
    const children = item.children;
    if (!children) {
      return false;
    }
    return this.groupsCanHaveNoChildren || children.length > 0;
  }

  allowSelection(item: TreeSelectItem): boolean {
    return !this.hasChildren(item) || this.groupsSelectable;
  }

  private flat(item: TreeSelectItem, parent?: TreeSelectItem): [TreeSelectItem, TreeSelectItem?][] {
    if (!item.children) {
      return [[item, parent]];
    }
    return item.children.map((i) => this.flat(i, item)).reduce((acc, val) => acc.concat(val), [[item, parent]]); // .flat();
  }

  private flatNoParent(item: TreeSelectItem, parent?: TreeSelectItem): [TreeSelectItem, TreeSelectItem?][] {
    if (!item.children) {
      return [[item, parent]];
    }
    return item.children.map((i) => this.flatNoParent(i, item)).reduce((acc, val) => acc.concat(val), []); // .flat();
  }

  showGroup(item: TreeSelectItem) {
    if (!this.hasChildren(item) || this.treeControl?.isExpanded(item)) {
      return;
    }
    this.treeControl?.toggle(item);
    this.forceChange();
  }

  hideGroup(item: TreeSelectItem) {
    if (!this.hasChildren(item) || !this.treeControl?.isExpanded(item)) {
      return;
    }
    this.treeControl?.toggle(item);
    this.forceChange();
  }

  //#endregion

  //#region Выбор

  _select(item?: TreeSelectItem) {
    if (this.disabled || (item && !this.allowSelection(item))) {
      return;
    }
    if (this.multiple && this.selectedItem) {
      const index = this.selectedItem.indexOf(item);
      if (index > -1) {
        this.selectedItem.splice(index, 1);
      } else {
        this.selectedItem.push(item);
      }
      this.rawNgModel = this.selectedItem.map((i: TreeSelectItem) => this.$valueRef(i));
    } else {
      this.selectedItem = item;
      this.close();
      this.rawNgModel = this.$valueRef(this.selectedItem);
    }
    this.forceChange();
    this.onChange(this.rawNgModel);
    this.changeDetector.markForCheck();
  }

  _isSelected(item?: TreeSelectItem) {
    if (this.multiple) {
      return this.selectedItem?.indexOf(item) > -1;
    } else {
      return this.selectedItem === item;
    }
  }

  erase() {
    if (this.multiple) {
      if (this.selectedItem) {
        this.selectedItem.splice(0);
      }
      this.rawNgModel = [];
      this.onChange(this.rawNgModel);
      this.changeDetector.markForCheck();
    } else {
      this._select();
    }
  }

  //#endregion

  //#region Фокус

  @HostListener('focus', ['$event'])
  focusHandler(event: FocusEvent) {
    this.focused = true;
  }

  @HostListener('focusout', ['$event'])
  focusoutHandler(event: FocusEvent) {
    if (this.debug) {
      return;
    }
    if ((this.focused && !event.relatedTarget) || !this._isDescendant(this.elementRef.nativeElement, event.relatedTarget as HTMLElement)) {
      this.focused = false;
      this.onTouched();
    }
  }

  searchFocusout(event: FocusEvent) {
    this.focusoutHandler(event);
  }

  private _isDescendant(parent: HTMLElement, child: HTMLElement) {
    let node: HTMLElement | Node | null = child;
    while (node !== null) {
      if (node === parent) {
        return true;
      } else {
        node = node.parentNode;
      }
    }
    return false;
  }

  //#endregion

  //#region Поиск

  private search(searchText: string | null | undefined) {
    this.$searchText = searchText;
    if (!this.items) {
      return;
    }
    if (!searchText) {
      this.hiddenItems = new Set();
      this.changeDetector.markForCheck();
      return;
    }
    let getSearchStr: (item: TreeSelectItem) => string;
    switch (typeof this.searchRef) {
      case 'string':
        getSearchStr = (item: TreeSelectItem) => this.fetchFromObject(item, this.searchRef as string);
        break;

      case 'function':
        getSearchStr = this.searchRef;
    }

    const pattern = /[\-\[\]\/{}()*+?.\\^$|]/g;
    const searchWords = searchText
      .toLowerCase()
      .replace(pattern, '\\$&')
      .split(/\s+/)
      .filter((t) => t.length > 0);

    const searchRegex = new RegExp(searchWords.join('.*?'), 'i');

    const lookUp = (item: TreeSelectItem): boolean => {
      let match = false;
      const hasChildren = this.hasChildren(item);
      if (!hasChildren) {
        match = searchRegex.test(getSearchStr(item));
      }

      let foundAnyChild = false;
      if (hasChildren) {
        foundAnyChild = Boolean(item.children?.filter((i) => lookUp(i)).length);
      }
      const result = match || foundAnyChild;

      if (foundAnyChild) {
        this.showGroup(item);
      }
      if (!result) {
        this.hiddenItems.add(item);
      }
      return result;
    };

    this.hiddenItems.clear();
    this.items.forEach((v) => lookUp(v));
    this.forceChange();

    this.focusedIndex = null;

    this.changeDetector.markForCheck();
  }

  //#endregion

  //#region Клавиатура

  private selectFirst() {
    const currentSearchText = this.searchInput$?.nativeElement.value;
    if (currentSearchText !== this.$searchText) {
      this.search(currentSearchText);
    }
    const keyItems = this.filteredFlatSelectableItems;
    if (keyItems.length > 0) {
      const item = keyItems[0][0];
      if (this.selectedItem !== item && !(this.$multiple && this.selectedItem?.includes(item))) {
        this._select(item);
      }
    }
  }

  @HostListener('keydown', ['$event'])
  keyEvent(event: KeyboardEvent) {
    let isHotkey = true;
    const key = event.code || event.key;
    const items = this.filteredFlatItems;
    const item = this.focusedItem;
    const keyItems = this.filteredFlatSelectableItems;
    switch (key) {
      case 'Escape':
      case 'Esc':
        this.close();
        isHotkey = false;
        break;

      case 'Backspace':
      case 'Del':
      case 'Delete':
        if (this.panelOpen && this.hasSearch) {
          isHotkey = false;
        } else {
          if (this.selectedItem) {
            if (this.$multiple && this.selectedItem.length > 0 && Array.isArray(this.selectedItem)) {
              this._select(this.selectedItem[this.selectedItem.length - 1]);
            } else {
              this._select(this.selectedItem);
            }
          }
        }
        break;

      case 'Space':
      case 'Spacebar':
        if (this.panelOpen) {
          if (this.searchFocused) {
            return;
          }
          if (this.focusedIndex !== null) {
            if (item && this.hasChildren(item)) {
              this.treeControl?.toggle(item);
            } else {
              this._select(item);
              if (!this.$multiple) {
                isHotkey = false;
              }
            }
          }
        } else {
          this.open();
        }
        break;

      case 'Tab':
        isHotkey = false;
        // иначе первое нажатие только закроет выпадающий список
        if (this.panelOpen) {
          if (this.performedSearch && keyItems.length > 0 && this.focusedIndex === null) {
            this.selectFirst();
          }
          if (this.focusedIndex !== null) {
            if (item && this.hasChildren(item)) {
              if (this.groupsSelectable) {
                this._select(item);
              }
            } else {
              this._select(item);
            }
          }
          this.close();
        }
        break;

      case 'Enter':
        if (this.panelOpen) {
          if (this.performedSearch && keyItems.length > 0 && this.focusedIndex === null) {
            this.selectFirst();
            isHotkey = false;
            break;
          }
          if (this.focusedIndex !== null) {
            if (item && this.hasChildren(item)) {
              if (this.groupsSelectable) {
                this._select(item);
                if (!this.$multiple) {
                  isHotkey = false;
                }
              } else {
                this.treeControl?.toggle(item);
              }
            } else {
              this._select(item);
              if (!this.$multiple) {
                isHotkey = false;
              }
            }
          }
        }
        break;

      case 'ArrowUp':
      case 'Up':
        if (!this.panelOpen) {
          this.open();
          break;
        }
        if (items.length > 0) {
          if (this.focusedIndex === null) {
            this.focusedIndex = 0;
          } else {
            if (this.focusedIndex > 0) {
              if (event.shiftKey && this.$multiple) {
                this._select(this.focusedItem);
              }
              this.focusedIndex--;
            }
          }
          this.scrollTo(this.focusedIndex);
        }
        break;

      case 'ArrowDown':
      case 'Down':
        if (!this.panelOpen) {
          this.open();
          break;
        }
        if (items.length > 0) {
          if (this.focusedIndex === null) {
            this.focusedIndex = 0;
          } else {
            if (items.length > this.focusedIndex + 1) {
              if (event.shiftKey && this.$multiple) {
                this._select(this.focusedItem);
              }
              this.focusedIndex++;
            }
          }
          this.scrollTo(this.focusedIndex);
        }
        break;

      case 'ArrowRight':
      case 'Right':
        if (!this.panelOpen) {
          isHotkey = false;
          break;
        }
        if (items.length === 0 || !item || this.focusedIndex === null || !this.hasChildren(item)) {
          isHotkey = false;
          break;
        }
        if (!this.treeControl?.isExpanded(item)) {
          this.showGroup(item);
          if (items.length > this.focusedIndex + 1) {
            const nextIndex = this.filteredFlatItems.findIndex((v) => v[1] === item);
            if (nextIndex > -1) {
              this.focusedIndex = nextIndex;
            }
          }
        }
        break;

      case 'ArrowLeft':
      case 'Left':
        if (!this.panelOpen) {
          isHotkey = false;
          break;
        }
        if (items.length === 0 || !item || this.focusedIndex === null) {
          isHotkey = false;
          break;
        }
        if (this.focusedIndex > 0) {
          const targetItem = items[this.focusedIndex][1];
          if (targetItem) {
            this.focusedIndex = items.findIndex((v) => v[0] === targetItem);
            if (this.focusedItem && this.treeControl?.isExpanded(this.focusedItem)) {
              this.hideGroup(this.focusedItem);
            }
          }
        }
        break;

      default:
        if (event.key.length === 1) {
          if (!this.searchFocused) {
            if (!this.panelOpen) {
              this.open();
            } else {
              this.searchInput$?.nativeElement.focus();
            }
            // note: иначе не успевает учесть
            this.$searchText = event.key;
            this.searchText = event.key;
          }
        }
        isHotkey = false;
    }

    if (isHotkey) {
      event.cancelBubble = true;
      if (event.stopPropagation) {
        event.stopPropagation();
      }
      return false;
    }
    return true;
  }

  private scrollTo(index: number) {
    if (this.virtualViewport$) {
      this.virtualViewport$.scrollToIndex(index - 5);
    }
  }

  //#endregion
}
